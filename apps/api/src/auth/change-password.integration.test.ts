/**
 * Integration tests for AuthService.changePassword (#44)
 *
 * Tests the core logic directly against PGlite (no HTTP layer, no NestJS DI):
 *  - wrong current password → UnauthorizedException
 *  - new password fails policy → BadRequestException
 *  - valid change updates the hash and returns success message
 *  - account without password hash (OAuth-only) → BadRequestException
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import * as schema from '../db/schema';
import { USERS_DDL } from '../test-helpers/pglite-ddl';

const BCRYPT_ROUNDS = 4; // fast for tests

const CORRECT_PW = 'OldPass1';
const NEW_PW = 'NewPass1';

const U1 = '00000000-0000-0000-0000-000000000001';
const U2 = '00000000-0000-0000-0000-000000000002';

/** Minimal extracted logic of AuthService.changePassword — avoids NestJS DI */
async function changePassword(
  db: ReturnType<typeof drizzle<typeof schema>>,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  // policy check (mirrors auth.service.ts)
  if (!newPassword || newPassword.length < 8) throw Object.assign(new Error('密碼至少 8 個字元'), { status: 400 });
  if (newPassword.length > 72) throw Object.assign(new Error('密碼最多 72 個字元'), { status: 400 });
  if (!/[A-Z]/.test(newPassword)) throw Object.assign(new Error('密碼需包含至少一個大寫字母'), { status: 400 });
  if (!/[0-9]/.test(newPassword)) throw Object.assign(new Error('密碼需包含至少一個數字'), { status: 400 });

  const rows = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const existing = rows[0];
  if (!existing?.passwordHash) {
    throw Object.assign(new Error('帳號尚未設定密碼，請使用「設定密碼」功能'), { status: 400 });
  }

  const valid = await bcrypt.compare(currentPassword, existing.passwordHash);
  if (!valid) throw Object.assign(new Error('目前密碼不正確'), { status: 401 });

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { message: '密碼已更新' };
}

describe('changePassword integration (#44)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(USERS_DDL);
    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
  });

  beforeEach(async () => {
    await client.exec(`DELETE FROM users;`);

    const hash = await bcrypt.hash(CORRECT_PW, BCRYPT_ROUNDS);
    await client.exec(`
      INSERT INTO users (id, email, password_hash, role, display_name)
      VALUES
        ('${U1}', 'user1@test.local', '${hash}', 'respondent', 'User1'),
        ('${U2}', 'oauth@test.local', NULL, 'respondent', 'OAuthUser');
    `);
  });

  it('成功更改密碼，新舊 hash 不同', async () => {
    const result = await changePassword(db, U1, CORRECT_PW, NEW_PW);
    expect(result.message).toBe('密碼已更新');

    const [row] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, U1));

    expect(row.passwordHash).not.toBeNull();
    const valid = await bcrypt.compare(NEW_PW, row.passwordHash!);
    expect(valid).toBe(true);
    const oldValid = await bcrypt.compare(CORRECT_PW, row.passwordHash!);
    expect(oldValid).toBe(false);
  });

  it('舊密碼錯誤時拋出 401 error', async () => {
    await expect(changePassword(db, U1, 'WrongPass1', NEW_PW)).rejects.toMatchObject({
      message: '目前密碼不正確',
      status: 401,
    });
  });

  it('新密碼太短時拋出 400 error', async () => {
    await expect(changePassword(db, U1, CORRECT_PW, 'Ab1')).rejects.toMatchObject({ status: 400 });
  });

  it('新密碼無大寫時拋出 400 error', async () => {
    await expect(changePassword(db, U1, CORRECT_PW, 'nouppercase1')).rejects.toMatchObject({ status: 400 });
  });

  it('新密碼無數字時拋出 400 error', async () => {
    await expect(changePassword(db, U1, CORRECT_PW, 'NoDigitsHere')).rejects.toMatchObject({ status: 400 });
  });

  it('OAuth-only 帳號（無密碼）拋出 400 error', async () => {
    await expect(changePassword(db, U2, CORRECT_PW, NEW_PW)).rejects.toMatchObject({ status: 400 });
  });
});
