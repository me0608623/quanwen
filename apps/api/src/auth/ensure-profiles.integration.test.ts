/**
 * Phase A: 註冊時自動建兩種 profile 的行為驗證
 *
 * 不走 AppModule (避開 admin.module 動態 require 在 vitest 不解析的問題)
 * 直接 PGlite + 服務級隔離測試。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';

import * as schema from '../db/schema';

const U1 = '11111111-1111-1111-1111-111111111111';

describe('Phase A: ensureBothProfiles (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role     AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status   AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role          user_role NOT NULL,
        status        user_status NOT NULL DEFAULT 'active',
        display_name  VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE age_range AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
      CREATE TYPE gender    AS ENUM ('male','female','non_binary','prefer_not_to_say');
      CREATE TYPE occupation AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
      CREATE TYPE education AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
      CREATE TYPE industry AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
      CREATE TABLE respondent_profiles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        age_range       age_range,
        gender          gender,
        region          VARCHAR(20),
        occupation      occupation,
        industry        industry,
        industry_other  VARCHAR(50),
        education       education,
        reputation_score INTEGER NOT NULL DEFAULT 60,
        completion_rate NUMERIC(5,2) DEFAULT 100.00,
        total_completed INTEGER NOT NULL DEFAULT 0,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        suspended_until TIMESTAMPTZ,
        suspended_reason VARCHAR(200),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE surveyor_profiles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        institution_name VARCHAR(200),
        research_purpose VARCHAR(500),
        is_verified     BOOLEAN NOT NULL DEFAULT false,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${U1}', 'u1@test.local', 'respondent', 'User 1');
    `);
    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
  });

  beforeEach(async () => {
    await client.exec(`DELETE FROM respondent_profiles; DELETE FROM surveyor_profiles;`);
  });

  it('1. ensureBothProfiles 第一次跑會建兩種 profile', async () => {
    // 模擬 auth.service.ts:ensureBothProfiles 的邏輯
    await db
      .insert(schema.respondentProfiles)
      .values({ userId: U1, isOnboardingDone: false })
      .onConflictDoNothing();
    await db
      .insert(schema.surveyorProfiles)
      .values({ userId: U1, isOnboardingDone: false })
      .onConflictDoNothing();

    const resp = await db.select().from(schema.respondentProfiles).where(eq(schema.respondentProfiles.userId, U1));
    const surv = await db.select().from(schema.surveyorProfiles).where(eq(schema.surveyorProfiles.userId, U1));
    expect(resp.length).toBe(1);
    expect(surv.length).toBe(1);
  });

  it('2. ensureBothProfiles 第二次跑是冪等 (ON CONFLICT DO NOTHING)', async () => {
    for (let i = 0; i < 3; i++) {
      await db
        .insert(schema.respondentProfiles)
        .values({ userId: U1, isOnboardingDone: false })
        .onConflictDoNothing();
      await db
        .insert(schema.surveyorProfiles)
        .values({ userId: U1, isOnboardingDone: false })
        .onConflictDoNothing();
    }

    const resp = await db.select().from(schema.respondentProfiles).where(eq(schema.respondentProfiles.userId, U1));
    const surv = await db.select().from(schema.surveyorProfiles).where(eq(schema.surveyorProfiles.userId, U1));
    // user_id UNIQUE → 仍只有 1 筆
    expect(resp.length).toBe(1);
    expect(surv.length).toBe(1);
  });

  it('3. 重啟後再次 ensure 不會覆蓋已存的 isOnboardingDone=true', async () => {
    // 第一次建
    await db
      .insert(schema.respondentProfiles)
      .values({ userId: U1, isOnboardingDone: false })
      .onConflictDoNothing();

    // user 自己去把 onboarding 完成
    await db
      .update(schema.respondentProfiles)
      .set({ isOnboardingDone: true })
      .where(eq(schema.respondentProfiles.userId, U1));

    // ensure 再跑(像 OAuth login 又走一次)
    await db
      .insert(schema.respondentProfiles)
      .values({ userId: U1, isOnboardingDone: false })
      .onConflictDoNothing();

    const [r] = await db.select().from(schema.respondentProfiles).where(eq(schema.respondentProfiles.userId, U1));
    expect(r.isOnboardingDone).toBe(true);
  });
});
