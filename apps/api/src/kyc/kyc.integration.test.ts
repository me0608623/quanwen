/**
 * Phase BB: KYC 流程整合測試
 *
 * 紅線「個資不可漏」：身分證號 / 真實姓名 / 手機號 必須 AES-256-GCM 加密儲存。
 * 紅線「金流」交叉：assertKycForWithdrawal 是大額提領 gate（≥ NT$2,000）。
 *
 * 覆蓋：
 *  1. submit：合法 input → status=submitted，3 個 PII 欄位皆密文且可解密還原
 *  2. submit：身分證格式錯 → BadRequest
 *  3. submit：手機格式錯 → BadRequest
 *  4. submit：真實姓名過短 → BadRequest
 *  5. submit：upsert 行為（同一 userId 重新提交應更新 cipher、不新建 row）
 *  6. submit：已 approved 不可重提（Conflict）
 *  7. approve：status → approved + adminNote/reviewedBy 寫入
 *  8. reject：需附說明 ≥5 字
 *  9. assertKycForWithdrawal：< 2000 不檢查；≥ 2000 未通過 → BadRequest；通過 → pass
 *  10. listPending：回傳已解密的 PII（供 admin 看）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { BadRequestException, ConflictException } from '@nestjs/common';

process.env.PII_ENCRYPTION_KEY = 'phase-bb-kyc-test-pii-key';
process.env.PII_KDF_SALT = 'phase-bb-salt';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { KycService, KYC_REQUIRED_THRESHOLD } from './kyc.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '00000000-0000-0000-0000-000000000099';

describe('KycService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: KycService;
  let crypto: CryptoService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role     AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status   AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email        VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role         user_role NOT NULL,
        status       user_status NOT NULL DEFAULT 'active',
        display_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE kyc_status AS ENUM ('unverified','submitted','approved','rejected');
      CREATE TABLE kyc_verifications (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status            kyc_status NOT NULL DEFAULT 'unverified',
        id_number_cipher  TEXT,
        real_name_cipher  TEXT,
        phone_cipher      TEXT,
        id_front_url      VARCHAR(500),
        id_back_url       VARCHAR(500),
        selfie_url        VARCHAR(500),
        admin_note        VARCHAR(500),
        reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
        submitted_at      TIMESTAMPTZ,
        reviewed_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${USER_ID}', 'aa@aa.aa', 'respondent', '受試者 aa'),
        ('${ADMIN_ID}', 'cc@cc.cc', 'admin', '管理員 cc');
    `);

    db = drizzle(client, { schema });
    crypto = new CryptoService();
    const notifications = { create: async () => undefined } as never;
    // MultiAccountDetector stub：scanAndAlertIfRisky 必須回 thenable
    const detector = {
      scanAndAlertIfRisky: async () => ({ recommendation: 'safe' as const }),
    } as never;

    service = new KycService(db as never, crypto, notifications, detector);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function statusRow() {
    const [r] = await db
      .select()
      .from(schema.kycVerifications)
      .where(eq(schema.kycVerifications.userId, USER_ID))
      .limit(1);
    return r;
  }

  it('1. submit 合法 input：status=submitted、3 個 PII cipher 可還原', async () => {
    await service.submit(USER_ID, {
      idNumber: 'A123456789',
      realName: '王小明',
      phone: '0912345678',
    });

    const row = await statusRow();
    expect(row?.status).toBe('submitted');
    expect(row?.submittedAt).toBeTruthy();

    // 3 個 PII 欄位皆為 v1: 開頭 cipher
    expect(row?.idNumberCipher?.startsWith('v1:')).toBe(true);
    expect(row?.realNameCipher?.startsWith('v1:')).toBe(true);
    expect(row?.phoneCipher?.startsWith('v1:')).toBe(true);

    // 解密回原值
    expect(crypto.decrypt(row!.idNumberCipher!)).toBe('A123456789');
    expect(crypto.decrypt(row!.realNameCipher!)).toBe('王小明');
    expect(crypto.decrypt(row!.phoneCipher!)).toBe('0912345678');
  });

  it('2. submit 身分證格式錯 → BadRequest', async () => {
    await expect(
      service.submit(USER_ID, {
        idNumber: 'X1234',
        realName: '王小明',
        phone: '0912345678',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. submit 手機格式錯 → BadRequest', async () => {
    await expect(
      service.submit(USER_ID, {
        idNumber: 'A123456789',
        realName: '王小明',
        phone: '123', // 太短
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('4. submit 真實姓名過短 → BadRequest', async () => {
    await expect(
      service.submit(USER_ID, {
        idNumber: 'A123456789',
        realName: '王',
        phone: '0912345678',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. submit upsert：同 userId 重提應更新 row（id 不變、cipher 新）', async () => {
    const before = await statusRow();
    const oldId = before?.id;
    const oldCipher = before?.idNumberCipher;

    await service.submit(USER_ID, {
      idNumber: 'B234567890',
      realName: '王小華',
      phone: '0987654321',
    });

    const after = await statusRow();
    expect(after?.id).toBe(oldId); // 同 row
    expect(after?.idNumberCipher).not.toBe(oldCipher); // cipher 更新
    expect(crypto.decrypt(after!.idNumberCipher!)).toBe('B234567890');
    expect(crypto.decrypt(after!.realNameCipher!)).toBe('王小華');
  });

  it('6. approve：status → approved + reviewedBy 寫入', async () => {
    const before = await statusRow();
    await service.approve(before!.id, ADMIN_ID, '證件清晰可辨識');

    const after = await statusRow();
    expect(after?.status).toBe('approved');
    expect(after?.reviewedBy).toBe(ADMIN_ID);
    expect(after?.reviewedAt).toBeTruthy();
    expect(after?.adminNote ?? '').toBe('證件清晰可辨識');
  });

  it('7. submit 已 approved 不可重提 → Conflict', async () => {
    await expect(
      service.submit(USER_ID, {
        idNumber: 'A123456789',
        realName: '王小明',
        phone: '0912345678',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('8. assertKycForWithdrawal：approved 用戶大額提領通過', async () => {
    await expect(
      service.assertKycForWithdrawal(USER_ID, KYC_REQUIRED_THRESHOLD + 1),
    ).resolves.toBeUndefined();
  });

  it('9. assertKycForWithdrawal：< threshold 不檢查（即使無 KYC）', async () => {
    const noKycUser = '99999999-9999-9999-9999-999999999999';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${noKycUser}', 'ghost@ghost.ghost', 'respondent', '無 KYC 用戶');
    `);
    await expect(
      service.assertKycForWithdrawal(noKycUser, KYC_REQUIRED_THRESHOLD - 1),
    ).resolves.toBeUndefined();
  });

  it('10. assertKycForWithdrawal：≥ threshold 未通過 → BadRequest', async () => {
    const noKycUser = '99999999-9999-9999-9999-999999999999';
    await expect(
      service.assertKycForWithdrawal(noKycUser, KYC_REQUIRED_THRESHOLD),
    ).rejects.toThrow(BadRequestException);
  });

  it('11. listPending：回傳已解密 PII 供 admin 看', async () => {
    // 另開一個 user 提交，這次留 submitted 不 approve
    const pendingUser = '88888888-8888-8888-8888-888888888888';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${pendingUser}', 'dd@dd.dd', 'respondent', '待審 dd');
    `);
    // 合法 TW ID：第 2 位必須是 1 或 2（1=男，2=女）
    await service.submit(pendingUser, {
      idNumber: 'C245678901',
      realName: '李大方',
      phone: '0922334455',
    });

    const list = await service.listPending();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const me = list.find((x) => x.userId === pendingUser);
    expect(me?.idNumber).toBe('C245678901');
    expect(me?.realName).toBe('李大方');
    expect(me?.phone).toBe('0922334455');
  });

  it('12. reject：需附 ≥5 字說明', async () => {
    const pendingUser = '88888888-8888-8888-8888-888888888888';
    const row = await db
      .select()
      .from(schema.kycVerifications)
      .where(eq(schema.kycVerifications.userId, pendingUser))
      .limit(1);
    const kycId = row[0]!.id;

    await expect(service.reject(kycId, ADMIN_ID, '不')).rejects.toThrow(BadRequestException);

    await service.reject(kycId, ADMIN_ID, '證件影像不清晰，請重新拍攝後上傳');
    const [after] = await db
      .select()
      .from(schema.kycVerifications)
      .where(eq(schema.kycVerifications.id, kycId))
      .limit(1);
    expect(after?.status).toBe('rejected');
    expect(after?.adminNote ?? '').toContain('證件影像不清晰');
  });
});
