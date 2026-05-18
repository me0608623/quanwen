import 'dotenv/config';
import { db } from './index';
import { users } from './schema';
import * as bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding development database...');

  const passwordHash = await bcrypt.hash('Password1', 12);

  await db
    .insert(users)
    .values([
      {
        email: 'surveyor@example.com',
        passwordHash,
        displayName: '測試問券方',
        role: 'surveyor',
        emailVerified: true,
      },
      {
        email: 'respondent@example.com',
        passwordHash,
        displayName: '測試受試者',
        role: 'respondent',
        emailVerified: true,
      },
      {
        email: 'admin@quanwen.com',
        passwordHash,
        displayName: '平台管理員',
        role: 'admin',
        emailVerified: true,
      },
    ])
    .onConflictDoNothing();

  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
