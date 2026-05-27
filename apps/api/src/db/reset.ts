/**
 * Dev only: 清掉所有業務資料表 (users 除外), 留乾淨環境給 db:seed 用
 * 不掉 schema 本身, 不用重跑 db:push.
 *
 * 注意: 會清掉 users / surveys / mutual_pairs / responses / kyc / wallet 等。
 *       prod 絕對不可跑。
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

async function reset() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot run db:reset against NODE_ENV=production');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('💣 Truncating tables (CASCADE)...');

  // 依依賴順序; users 最後
  // CASCADE 自動處理 FK
  const order = [
    'point_redemptions', 'point_shop_items',
    'kyc_verifications',
    'reputation_history',
    'response_appeals',
    'wallets', 'journal_entries', 'transactions',
    'notifications',
    'response_answers', 'survey_responses',
    'mutual_pairs',
    'question_options', 'survey_questions', 'surveys',
    'respondent_tags', 'respondent_profiles', 'surveyor_profiles',
    'interest_tags',
    'oauth_accounts',
    'users',
  ];

  for (const table of order) {
    try {
      await db.execute(sql.raw(`TRUNCATE TABLE ${table} CASCADE`));
      console.log(`  ✓ truncated ${table}`);
    } catch (err) {
      console.warn(`  ⚠️  ${table} skip:`, (err as Error).message.slice(0, 80));
    }
  }

  console.log('✅ Reset done. 接著跑 pnpm db:seed 重新灌測試帳號 + demo 資料');
  await pool.end();
}

reset().catch((e) => {
  console.error(e);
  process.exit(1);
});
