/**
 * 開發環境種子資料 — 只在連接真實 PostgreSQL 時使用
 * 執行：pnpm db:seed
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from './schema';
import * as bcrypt from 'bcryptjs';

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set — seed only runs against real PostgreSQL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users } });

  console.log('🌱 Seeding...');
  const passwordHash = await bcrypt.hash('Password1', 12);

  await db.insert(users).values([
    { email: 'surveyor@example.com', passwordHash, displayName: '測試問券方', role: 'surveyor', emailVerified: true },
    { email: 'respondent@example.com', passwordHash, displayName: '測試受試者', role: 'respondent', emailVerified: true },
    { email: 'admin@quanwen.com', passwordHash, displayName: '平台管理員', role: 'admin', emailVerified: true },
  ]).onConflictDoNothing();

  console.log('✅ Done');
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
