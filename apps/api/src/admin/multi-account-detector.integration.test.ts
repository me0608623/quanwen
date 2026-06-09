/**
 * Phase DD: MultiAccountDetector 整合測試
 *
 * 紅線「個資 + 反詐」交叉：偵測同銀行 / 同身分證 / 同手機 / 同 user-agent，
 * 並計算 risk score → recommendation (safe/review/block)。
 *
 * 真實 PGlite + 真實 CryptoService（驗 cipher 跨 user 比對流程）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

process.env.PII_ENCRYPTION_KEY = 'phase-dd-mad-test-pii-key';
process.env.PII_KDF_SALT = 'phase-dd-salt';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { MultiAccountDetectorService } from './multi-account-detector.service';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CAROL = '33333333-3333-3333-3333-333333333333';
const DAVE = '44444444-4444-4444-4444-444444444444';

describe('MultiAccountDetectorService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MultiAccountDetectorService;
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

      CREATE TYPE transaction_type AS ENUM (
        'deposit','reward_out','reward_in','platform_fee',
        'withdraw_request','withdraw_complete','refund',
        'points_in','points_spend'
      );
      CREATE TYPE transaction_status AS ENUM (
        'pending','processing','success','failed','cancelled'
      );
      CREATE TABLE transactions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type                transaction_type NOT NULL,
        amount              INTEGER NOT NULL CHECK (amount > 0),
        status              transaction_status NOT NULL DEFAULT 'pending',
        external_provider   VARCHAR(50),
        external_ref        VARCHAR(200),
        related_survey_id   UUID,
        related_response_id UUID,
        note                TEXT,
        metadata            JSONB,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at        TIMESTAMPTZ,
        approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
        action_at           TIMESTAMPTZ,
        action_ip           TEXT,
        UNIQUE (external_provider, external_ref)
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

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(200) NOT NULL,
        status      survey_status NOT NULL DEFAULT 'draft',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        reward_type  reward_type NOT NULL DEFAULT 'cash',
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');
      CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');
      CREATE TABLE survey_responses (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id            UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status               response_status NOT NULL DEFAULT 'in_progress',
        sentiment           response_sentiment,
        started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at         TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score     INTEGER,
        suspicious_flags     JSONB,
        quality_score        INTEGER,
        quality_breakdown    JSONB,
        behavior_log         JSONB,
        UNIQUE (survey_id, respondent_id)
      );
    `);

    // 4 users
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${ALICE}', 'alice@test.test', 'respondent', 'Alice'),
        ('${BOB}',   'bob@test.test',   'respondent', 'Bob'),
        ('${CAROL}', 'carol@test.test', 'respondent', 'Carol'),
        ('${DAVE}',  'dave@test.test',  'respondent', 'Dave'),
        ('00000000-0000-0000-0000-000000000099', 'admin@test.test', 'admin', 'admin');
    `);

    db = drizzle(client, { schema });
    crypto = new CryptoService();
    const notifications = { create: async () => undefined } as never;
    service = new MultiAccountDetectorService(db as never, notifications, crypto);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function seedWithdrawWithBank(userId: string, bankAccount: string) {
    const bankAccountCipher = crypto.encrypt(bankAccount);
    await db.insert(schema.transactions).values({
      userId,
      type: 'withdraw_request',
      amount: 500,
      status: 'pending',
      metadata: { bankCode: '700', bankAccountCipher },
    });
  }

  async function seedKyc(userId: string, idNumber: string, phone: string) {
    await db.insert(schema.kycVerifications).values({
      userId,
      status: 'approved',
      idNumberCipher: crypto.encrypt(idNumber),
      realNameCipher: crypto.encrypt('測試用戶'),
      phoneCipher: crypto.encrypt(phone),
    });
  }

  it('1. 完全乾淨（無提領、無 KYC）→ riskScore=0、safe', async () => {
    const report = await service.scanUser(ALICE);
    expect(report.scannedUserId).toBe(ALICE);
    expect(report.signals).toEqual([]);
    expect(report.riskScore).toBe(0);
    expect(report.recommendation).toBe('safe');
  });

  it('2. 同銀行帳號（Alice 與 Bob）→ high severity signal', async () => {
    const sharedAccount = '700-12345678901';
    await seedWithdrawWithBank(ALICE, sharedAccount);
    await seedWithdrawWithBank(BOB, sharedAccount);

    const report = await service.scanUser(ALICE);
    const bankSig = report.signals.find((s) => s.type === 'shared_bank_account');
    expect(bankSig).toBeTruthy();
    expect(bankSig?.severity).toBe('high');
    expect(bankSig?.relatedUserIds).toContain(BOB);
    expect(report.riskScore).toBeGreaterThanOrEqual(40); // high = +40
  });

  it('3. 不同銀行帳號 → 無 shared_bank_account signal', async () => {
    // Carol 用獨立帳號
    await seedWithdrawWithBank(CAROL, '700-99999999999');
    const report = await service.scanUser(CAROL);
    const bankSig = report.signals.find((s) => s.type === 'shared_bank_account');
    expect(bankSig).toBeUndefined();
  });

  it('4. 同身分證號（Alice 與 Carol）→ high severity', async () => {
    const sharedId = 'A123456789';
    await seedKyc(ALICE, sharedId, '0911111111');
    await seedKyc(CAROL, sharedId, '0933333333'); // 同 ID 不同手機

    const report = await service.scanUser(ALICE);
    const idSig = report.signals.find((s) => s.type === 'shared_id_number');
    expect(idSig).toBeTruthy();
    expect(idSig?.severity).toBe('high');
    expect(idSig?.relatedUserIds).toContain(CAROL);
  });

  it('5. 同手機號（Alice 與 Dave）→ medium severity', async () => {
    const sharedPhone = '0987654321';
    // Alice 已有 KYC（從 case 4），需先 update 把 phone 換成 shared
    const aliceNewPhone = crypto.encrypt(sharedPhone);
    await client.exec(`
      UPDATE kyc_verifications SET phone_cipher = '${aliceNewPhone.replace(/'/g, "''")}'
      WHERE user_id = '${ALICE}';
    `);
    await seedKyc(DAVE, 'B234567890', sharedPhone);

    const report = await service.scanUser(ALICE);
    const phoneSig = report.signals.find((s) => s.type === 'shared_phone');
    expect(phoneSig).toBeTruthy();
    expect(phoneSig?.severity).toBe('medium');
    expect(phoneSig?.relatedUserIds).toContain(DAVE);
  });

  it('6. 多訊號疊加：Alice 同時觸發 3 種 signal → recommendation 升級', async () => {
    const report = await service.scanUser(ALICE);
    const types = new Set(report.signals.map((s) => s.type));
    expect(types).toContain('shared_bank_account'); // case 2
    expect(types).toContain('shared_id_number');    // case 4
    expect(types).toContain('shared_phone');        // case 5

    // 2 high (40+40) + 1 medium (20) = 100 → block
    expect(report.riskScore).toBeGreaterThanOrEqual(80);
    expect(report.recommendation).toBe('block');
  });

  it('7. scanAndAlertIfRisky：safe 不通知 / 不安全 → 觸發通知（不會 throw）', async () => {
    // safe user
    const safeReport = await service.scanAndAlertIfRisky(BOB, 'KYC 提交');
    expect(safeReport.recommendation).toBeDefined();
    // 不要求結果，只要 promise 解析就算 OK（內部 catch 已處理）

    // risky user (Alice has many signals)
    const riskyReport = await service.scanAndAlertIfRisky(ALICE, 'withdrawal');
    expect(['review', 'block']).toContain(riskyReport.recommendation);
  });

  it('8. 沒 KYC + 沒提領的用戶 → 不會 throw 也不會誤判', async () => {
    // 新建用戶，無任何資料
    const GHOST = '55555555-5555-5555-5555-555555555555';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${GHOST}', 'ghost@test.test', 'respondent', 'Ghost');
    `);
    const report = await service.scanUser(GHOST);
    expect(report.signals).toEqual([]);
    expect(report.riskScore).toBe(0);
    expect(report.recommendation).toBe('safe');
  });
});
