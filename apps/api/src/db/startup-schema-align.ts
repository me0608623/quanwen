import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool, type PoolClient } from 'pg';

/**
 * Prestart schema alignment (root-cause fix for recurring Neon schema drift).
 *
 * Why this exists: the API ships via `drizzle-kit push`, which silently skips
 * `ALTER TYPE ... ADD VALUE` and prompts (then aborts on EOF) for
 * `ALTER TABLE ... ADD COLUMN` on existing tables. When someone adds an enum
 * value or a column and forgets to mirror it into the CI ensure step, Neon
 * drifts and the deployed code 500s on every query that touches the missing
 * value/column — while /health stays 200 (issues #112, #118).
 *
 * This runner removes the dependency on the CI step and on human memory: on
 * every boot, before the app accepts traffic, it applies the idempotent
 * `scripts/ensure-enum-values.sql` (all statements are IF NOT EXISTS) directly
 * against the live database. Fresh env, reset DB, or skipped pipeline — the
 * schema self-aligns at startup.
 *
 * Best-effort by design: it never throws. A migration-runner hiccup must not
 * take down an otherwise-healthy API. Failures are logged loudly; the deploy
 * pipeline's psql step remains the fail-fast gate.
 */

const ENSURE_SQL_PATH = resolve(__dirname, '../../scripts/ensure-enum-values.sql');

export interface SchemaAlignResult {
  skipped: boolean;
  reason?: string;
  total: number;
  applied: number;
  failed: number;
}

/**
 * Split a SQL script into individual executable statements.
 * Strips `--` line comments and blank lines, then splits on `;`.
 * The ensure script contains only single-statement ALTERs with no semicolons
 * inside string literals, so a naive split is safe and matches how psql -f runs.
 */
export function parseSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');

  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface AlignOptions {
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** Connection attempts before giving up (Neon cold start can refuse the first few). */
  maxConnectAttempts?: number;
  /** Delay between connection attempts (ms). */
  connectRetryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runStartupSchemaAlignment(
  opts: AlignOptions = {},
): Promise<SchemaAlignResult> {
  const log = opts.logger ?? console;
  const maxAttempts = opts.maxConnectAttempts ?? 5;
  const retryDelay = opts.connectRetryDelayMs ?? 3000;

  // PGlite (in-memory dev/test) bootstraps its full schema inline in
  // DatabaseModule — nothing to align.
  if (process.env.USE_PG_MEM === 'true') {
    return { skipped: true, reason: 'USE_PG_MEM', total: 0, applied: 0, failed: 0 };
  }
  if (!process.env.DATABASE_URL) {
    log.warn('[schema-align] DATABASE_URL 未設定，跳過開機 schema 對齊');
    return { skipped: true, reason: 'no DATABASE_URL', total: 0, applied: 0, failed: 0 };
  }

  let sql: string;
  try {
    sql = readFileSync(ENSURE_SQL_PATH, 'utf8');
  } catch (err) {
    log.error(
      `[schema-align] 找不到 ensure SQL（${ENSURE_SQL_PATH}），跳過。請確認 Docker image 有 COPY apps/api/scripts。`,
      err,
    );
    return { skipped: true, reason: 'sql file not found', total: 0, applied: 0, failed: 0 };
  }

  const statements = parseSqlStatements(sql);
  if (statements.length === 0) {
    return { skipped: true, reason: 'empty sql', total: 0, applied: 0, failed: 0 };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    // generous timeout for Neon serverless cold start
    connectionTimeoutMillis: 15_000,
  });

  let applied = 0;
  let failed = 0;
  try {
    let client: PoolClient | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        client = await pool.connect();
        break;
      } catch (err) {
        if (attempt === maxAttempts) {
          log.error(
            `[schema-align] 連線失敗（${attempt}/${maxAttempts}），放棄開機對齊（不阻擋啟動）`,
            err,
          );
          return { skipped: true, reason: 'connect failed', total: statements.length, applied: 0, failed: 0 };
        }
        log.warn(`[schema-align] 連線失敗（${attempt}/${maxAttempts}），${retryDelay}ms 後重試…`);
        await sleep(retryDelay);
      }
    }
    if (!client) {
      return { skipped: true, reason: 'connect failed', total: statements.length, applied: 0, failed: 0 };
    }

    try {
      // Each statement runs as its own autocommit query (like psql -f), so
      // ALTER TYPE ... ADD VALUE is never wrapped in a transaction block.
      for (const stmt of statements) {
        try {
          await client.query(stmt);
          applied++;
        } catch (err) {
          failed++;
          log.error(`[schema-align] 語句失敗（已跳過繼續）: ${stmt.slice(0, 120)}`, err);
        }
      }
    } finally {
      client.release();
    }
  } catch (err) {
    log.error('[schema-align] 開機對齊發生非預期錯誤（不阻擋啟動）', err);
  } finally {
    await pool.end().catch(() => undefined);
  }

  if (failed === 0) {
    log.log(`[schema-align] ✅ 開機 schema 對齊完成：${applied}/${statements.length} 語句已套用（皆冪等）`);
  } else {
    log.warn(`[schema-align] ⚠️ 開機 schema 對齊：${applied} 成功 / ${failed} 失敗（見上方錯誤）`);
  }

  return { skipped: false, total: statements.length, applied, failed };
}
