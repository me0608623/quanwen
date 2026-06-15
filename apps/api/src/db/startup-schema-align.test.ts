/**
 * Unit tests for the prestart schema-alignment runner.
 *
 * Covers the pure statement parser and the boot-time skip gates. The actual SQL
 * execution path is exercised end-to-end against Neon (and the statements are
 * idempotent IF NOT EXISTS), so here we only verify parsing + gating logic that
 * runs with no live database.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { parseSqlStatements, runStartupSchemaAlignment } from './startup-schema-align';

const silentLogger = { log: () => undefined, warn: () => undefined, error: () => undefined };

describe('parseSqlStatements', () => {
  it('splits statements on semicolons and trims whitespace', () => {
    const sql = 'ALTER TABLE a ADD COLUMN x INT;\nALTER TABLE b ADD COLUMN y TEXT;\n';
    expect(parseSqlStatements(sql)).toEqual([
      'ALTER TABLE a ADD COLUMN x INT',
      'ALTER TABLE b ADD COLUMN y TEXT',
    ]);
  });

  it('strips -- line comments', () => {
    const sql = [
      '-- a leading comment',
      "ALTER TYPE t ADD VALUE IF NOT EXISTS 'foo'; -- trailing comment",
      '-- another comment',
      "ALTER TYPE t ADD VALUE IF NOT EXISTS 'bar';",
    ].join('\n');
    expect(parseSqlStatements(sql)).toEqual([
      "ALTER TYPE t ADD VALUE IF NOT EXISTS 'foo'",
      "ALTER TYPE t ADD VALUE IF NOT EXISTS 'bar'",
    ]);
  });

  it('drops blank/comment-only content', () => {
    expect(parseSqlStatements('-- only a comment\n\n  \n')).toEqual([]);
  });
});

describe('runStartupSchemaAlignment gating', () => {
  const prevPgMem = process.env.USE_PG_MEM;
  const prevDbUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (prevPgMem === undefined) delete process.env.USE_PG_MEM;
    else process.env.USE_PG_MEM = prevPgMem;
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  });

  it('skips (no DB access) when USE_PG_MEM=true', async () => {
    process.env.USE_PG_MEM = 'true';
    const res = await runStartupSchemaAlignment({ logger: silentLogger });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('USE_PG_MEM');
    expect(res.applied).toBe(0);
  });

  it('skips when DATABASE_URL is not set', async () => {
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_URL;
    const res = await runStartupSchemaAlignment({ logger: silentLogger });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no DATABASE_URL');
  });
});
