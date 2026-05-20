import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// 共用型別（node-postgres 和 pglite 的 query interface 相同）
export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

const DB_TOKEN = 'DB';
export { DB_TOKEN as DB };

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: async (): Promise<AppDb> => {
        if (process.env.USE_PG_MEM === 'true') {
          const { PGlite } = await import('@electric-sql/pglite');
          const { drizzle: drizzlePg } = await import('drizzle-orm/pglite');

          const client = new PGlite();

          // Sprint 1: users + oauth_accounts
          await client.exec(`
            CREATE TYPE user_role     AS ENUM ('surveyor', 'respondent', 'admin');
            CREATE TYPE auth_provider AS ENUM ('email', 'google', 'line', 'apple');
            CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'pending_verify');

            CREATE TABLE users (
              id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              email                          VARCHAR(255) NOT NULL UNIQUE,
              password_hash                  VARCHAR(255),
              role                           user_role    NOT NULL,
              status                         user_status  NOT NULL DEFAULT 'active',
              display_name                   VARCHAR(100) NOT NULL,
              avatar_url                     TEXT,
              email_verified                 BOOLEAN      NOT NULL DEFAULT false,
              password_reset_token           VARCHAR(128),
              password_reset_expires_at      TIMESTAMPTZ,
              email_verification_token       VARCHAR(128),
              email_verification_expires_at  TIMESTAMPTZ,
              role_selected_at               TIMESTAMPTZ,
              created_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              updated_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              deleted_at                     TIMESTAMPTZ
            );

            CREATE TABLE oauth_accounts (
              id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id             UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              provider            auth_provider NOT NULL,
              provider_account_id VARCHAR(255)  NOT NULL,
              provider_email      VARCHAR(255),
              provider_avatar_url TEXT,
              access_token        TEXT,
              refresh_token       TEXT,
              token_expires_at    TIMESTAMPTZ,
              created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
            );
          `);

          // Sprint 2: profiles + tags
          await client.exec(`
            CREATE TYPE age_range   AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
            CREATE TYPE gender      AS ENUM ('male','female','non_binary','prefer_not_to_say');
            CREATE TYPE occupation  AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
            CREATE TYPE education   AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
            CREATE TYPE tag_category AS ENUM ('tech','lifestyle','finance','health','entertainment','food','travel','education','society','other');

            CREATE TABLE respondent_profiles (
              id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id            UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              age_range          age_range,
              gender             gender,
              region             VARCHAR(20),
              occupation         occupation,
              education          education,
              reputation_score   INTEGER     NOT NULL DEFAULT 60,
              completion_rate    NUMERIC(5,2) DEFAULT 100.00,
              total_completed    INTEGER     NOT NULL DEFAULT 0,
              is_onboarding_done BOOLEAN     NOT NULL DEFAULT false,
              suspended_until    TIMESTAMPTZ,
              suspended_reason   VARCHAR(200),
              created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE surveyor_profiles (
              id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id            UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              institution_name   VARCHAR(200),
              research_purpose   VARCHAR(500),
              is_verified        BOOLEAN     NOT NULL DEFAULT false,
              is_onboarding_done BOOLEAN     NOT NULL DEFAULT false,
              created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE interest_tags (
              id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              name       VARCHAR(50) NOT NULL UNIQUE,
              category   tag_category NOT NULL,
              sort_order INTEGER     NOT NULL DEFAULT 0
            );

            CREATE TABLE respondent_tags (
              respondent_profile_id UUID NOT NULL REFERENCES respondent_profiles(id) ON DELETE CASCADE,
              tag_id                UUID NOT NULL REFERENCES interest_tags(id) ON DELETE CASCADE,
              PRIMARY KEY (respondent_profile_id, tag_id)
            );
          `);

          // Sprint 3: surveys + questions + options
          await client.exec(`
            CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
            CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
            CREATE TYPE reward_type AS ENUM ('cash','points');

            CREATE TABLE surveys (
              id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              surveyor_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              title            VARCHAR(200) NOT NULL,
              description      TEXT,
              status           survey_status NOT NULL DEFAULT 'draft',
              reward_points    INTEGER      NOT NULL DEFAULT 0,
              reward_type      reward_type  NOT NULL DEFAULT 'cash',
              audience_criteria JSONB,
              target_count     INTEGER      NOT NULL DEFAULT 100,
              completed_count  INTEGER      NOT NULL DEFAULT 0,
              expires_at       TIMESTAMPTZ,
              ai_score         INTEGER,
              ai_reject_reason TEXT,
              is_anonymous     BOOLEAN      NOT NULL DEFAULT true,
              created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              published_at     TIMESTAMPTZ
            );

            CREATE TABLE survey_questions (
              id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              survey_id   UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
              type        question_type NOT NULL,
              title       TEXT         NOT NULL,
              description TEXT,
              sort_order  INTEGER      NOT NULL DEFAULT 0,
              is_required BOOLEAN      NOT NULL DEFAULT true,
              config      JSONB,
              created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );

            CREATE TABLE question_options (
              id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              question_id UUID         NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
              label       VARCHAR(300) NOT NULL,
              sort_order  INTEGER      NOT NULL DEFAULT 0
            );
          `);

          // Sprint 4: survey_responses + response_answers
          await client.exec(`
            CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');

            CREATE TABLE survey_responses (
              id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
              survey_id            UUID            NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
              respondent_id        UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              status               response_status NOT NULL DEFAULT 'in_progress',
              started_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
              submitted_at         TIMESTAMPTZ,
              fill_duration_seconds INTEGER,
              anti_cheat_score     INTEGER,
              suspicious_flags     JSONB,
              quality_score        INTEGER,
              quality_breakdown    JSONB,
              behavior_log         JSONB,
              UNIQUE (survey_id, respondent_id)
            );

            CREATE TABLE response_answers (
              id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              response_id         UUID        NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
              question_id         UUID        NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
              text_answer         TEXT,
              selected_option_ids JSONB,
              rating_value        INTEGER,
              created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);

          // Sprint 6: notifications
          await client.exec(`
            CREATE TYPE notification_type AS ENUM (
              'survey_approved','survey_rejected','new_response','reward_issued','system'
            );

            CREATE TABLE notifications (
              id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id    UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              type       notification_type NOT NULL,
              title      VARCHAR(200)      NOT NULL,
              body       TEXT,
              metadata   JSONB,
              is_read    BOOLEAN           NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ       NOT NULL DEFAULT NOW()
            );
          `);

          // Sprint 7: wallets + transactions + journal_entries
          await client.exec(`
            CREATE TYPE transaction_type AS ENUM (
              'deposit','reward_out','reward_in','platform_fee',
              'withdraw_request','withdraw_complete','refund',
              'points_in','points_spend'
            );
            CREATE TYPE transaction_status AS ENUM (
              'pending','processing','success','failed','cancelled'
            );

            CREATE TABLE wallets (
              id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id        UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              cash_balance   INTEGER     NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
              locked_cash    INTEGER     NOT NULL DEFAULT 0 CHECK (locked_cash >= 0),
              points_balance INTEGER     NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
              version        INTEGER     NOT NULL DEFAULT 0,
              created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE transactions (
              id                  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id             UUID               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              type                transaction_type   NOT NULL,
              amount              INTEGER            NOT NULL CHECK (amount > 0),
              status              transaction_status NOT NULL DEFAULT 'pending',
              external_provider   VARCHAR(50),
              external_ref        VARCHAR(200),
              related_survey_id   UUID               REFERENCES surveys(id),
              related_response_id UUID               REFERENCES survey_responses(id),
              note                TEXT,
              metadata            JSONB,
              created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
              completed_at        TIMESTAMPTZ,
              UNIQUE (external_provider, external_ref)
            );

            CREATE TABLE journal_entries (
              id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
              transaction_id UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              account_name   VARCHAR(100) NOT NULL,
              debit_amount   INTEGER     NOT NULL DEFAULT 0,
              credit_amount  INTEGER     NOT NULL DEFAULT 0,
              created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);

          // Phase 6: response_appeals
          await client.exec(`
            CREATE TYPE appeal_status AS ENUM ('pending','approved','dismissed');

            CREATE TABLE response_appeals (
              id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
              response_id   UUID          NOT NULL UNIQUE REFERENCES survey_responses(id) ON DELETE CASCADE,
              respondent_id UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              reason        TEXT          NOT NULL,
              status        appeal_status NOT NULL DEFAULT 'pending',
              admin_note    VARCHAR(500),
              resolved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
              created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
              resolved_at   TIMESTAMPTZ
            );
          `);

          // Phase 7.1: reputation_history
          await client.exec(`
            CREATE TABLE reputation_history (
              id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              delta      INTEGER      NOT NULL,
              new_score  INTEGER      NOT NULL,
              reason     VARCHAR(200) NOT NULL,
              created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
          `);

          // Phase B (9): kyc_verifications
          await client.exec(`
            CREATE TYPE kyc_status AS ENUM ('unverified','submitted','approved','rejected');

            CREATE TABLE kyc_verifications (
              id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id           UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              status            kyc_status   NOT NULL DEFAULT 'unverified',
              id_number_cipher  TEXT,
              real_name_cipher  TEXT,
              phone_cipher      TEXT,
              id_front_url      VARCHAR(500),
              id_back_url       VARCHAR(500),
              selfie_url        VARCHAR(500),
              admin_note        VARCHAR(500),
              reviewed_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
              submitted_at      TIMESTAMPTZ,
              reviewed_at       TIMESTAMPTZ,
              created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
              updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
          `);

          // ── Seed dev users (auto-created on every startup) ──
          // Fixed UUIDs so we can reference these users in other seeds (surveys, etc.)
          const AA_ID = '11111111-1111-1111-1111-111111111111';
          const BB_ID = '22222222-2222-2222-2222-222222222222';
          const CC_ID = '00000000-0000-0000-0000-000000000099';
          // bcryptjs ESM interop：dynamic import 回的可能是 { default: { hash } } 或 { hash } 平鋪
          interface BcryptShape { hash: (s: string, rounds: number) => Promise<string> }
          const bcryptMod = (await import('bcryptjs')) as unknown as BcryptShape & { default?: BcryptShape };
          const bcrypt: BcryptShape = bcryptMod.default ?? bcryptMod;
          const aaHash = await bcrypt.hash('aa', 4);
          const bbHash = await bcrypt.hash('bb', 4);
          const ccHash = await bcrypt.hash('cc', 4);
          await client.exec(`
            INSERT INTO users (id, email, password_hash, role, status, display_name, email_verified, role_selected_at)
            VALUES
              ('${AA_ID}', 'aa@aa.aa', '${aaHash}', 'respondent', 'active', '受試者 aa', true, NOW()),
              ('${BB_ID}', 'bb@bb.bb', '${bbHash}', 'surveyor',   'active', '問券方 bb', true, NOW()),
              ('${CC_ID}', 'cc@cc.cc', '${ccHash}', 'admin',      'active', '管理員 cc', true, NOW())
            ON CONFLICT (email) DO NOTHING;
          `);

          // ── Pre-fill aa's respondent profile (skip onboarding wall) ──
          await client.exec(`
            INSERT INTO respondent_profiles (id, user_id, age_range, gender, region, occupation, education, reputation_score, completion_rate, total_completed, is_onboarding_done)
            VALUES (
              '77777777-7777-7777-7777-777777777777', '${AA_ID}',
              '25_34', 'female', '台北市', 'employed_full_time', 'bachelor',
              82, 95.00, 3, true
            )
            ON CONFLICT (user_id) DO NOTHING;
          `);

          // ── Pre-fill bb's surveyor profile ──
          await client.exec(`
            INSERT INTO surveyor_profiles (id, user_id, institution_name, research_purpose, is_verified, is_onboarding_done)
            VALUES (
              '88888888-8888-8888-8888-888888888888', '${BB_ID}',
              '國立台灣大學資管系', '研究台灣消費者行為與數位產品使用習慣', true, true
            )
            ON CONFLICT (user_id) DO NOTHING;
          `);

          // ── Seed wallets (cash_balance reflects historical reward income) ──
          await client.exec(`
            INSERT INTO wallets (user_id, cash_balance, locked_cash, points_balance, version)
            VALUES
              ('${AA_ID}', 160, 0, 0, 0),
              ('${BB_ID}', 5000, 2400, 0, 0)
            ON CONFLICT (user_id) DO NOTHING;
          `);

          // ── Seed transactions for aa (so /wallet & /earnings show history) ──
          await client.exec(`
            INSERT INTO transactions (id, user_id, type, amount, status, note, metadata, created_at, completed_at)
            VALUES
              ('55555555-5555-5555-5555-555555555501', '${AA_ID}', 'reward_in', 30, 'success',  '完成問卷：大學生外送習慣調查', NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
              ('55555555-5555-5555-5555-555555555502', '${AA_ID}', 'reward_in', 50, 'success',  '完成問卷：上班族咖啡消費',     NULL, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
              ('55555555-5555-5555-5555-555555555503', '${AA_ID}', 'reward_in', 80, 'success',  '完成問卷：健身 App 體驗',       NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
              -- bb seed opening：模擬問券方先儲值
              ('55555555-5555-5555-5555-5555555555b0', '${BB_ID}', 'deposit', 7400, 'success', '問券方初始儲值（dev seed）', NULL, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
              -- bb 鎖定 2400 給某問卷預算（type 用 deposit 避免被當平台手續費 revenue 計入）
              ('55555555-5555-5555-5555-5555555555b1', '${BB_ID}', 'deposit', 2400, 'success', '問卷預算鎖定 NT$2400（dev seed）', NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
              -- aa 申請提領 NT$300（待 admin 審核撥款）
              ('55555555-5555-5555-5555-555555555504', '${AA_ID}', 'withdraw_request', 300, 'pending',
                '申請提領至銀行帳戶',
                '{"bankCode":"700","bankAccountMasked":"01******0123","accountNameMasked":"陳◯試"}'::jsonb,
                NOW() - INTERVAL '6 hours', NULL)
            ON CONFLICT (id) DO NOTHING;
          `);

          // ── Phase I 修：對應的 journal_entries，讓 reconciliation 過 ──
          await client.exec(`
            INSERT INTO journal_entries (transaction_id, account_name, debit_amount, credit_amount) VALUES
              -- aa 3 筆 reward_in：把錢從 escrow_ecpay 撥到 wallet_aa（簡化版，省略對應 reward_out from surveyor）
              ('55555555-5555-5555-5555-555555555501', 'escrow_ecpay',           30, 0),
              ('55555555-5555-5555-5555-555555555501', 'wallet_${AA_ID}',         0, 30),
              ('55555555-5555-5555-5555-555555555502', 'escrow_ecpay',           50, 0),
              ('55555555-5555-5555-5555-555555555502', 'wallet_${AA_ID}',         0, 50),
              ('55555555-5555-5555-5555-555555555503', 'escrow_ecpay',           80, 0),
              ('55555555-5555-5555-5555-555555555503', 'wallet_${AA_ID}',         0, 80),
              -- bb 儲值 7400：DR escrow_ecpay / CR wallet_bb
              ('55555555-5555-5555-5555-5555555555b0', 'escrow_ecpay',         7400, 0),
              ('55555555-5555-5555-5555-5555555555b0', 'wallet_${BB_ID}',         0, 7400),
              -- bb 鎖定 2400：DR wallet_bb / CR survey_escrow
              ('55555555-5555-5555-5555-5555555555b1', 'wallet_${BB_ID}',      2400, 0),
              ('55555555-5555-5555-5555-5555555555b1', 'survey_escrow',           0, 2400);
          `);

          // ── Seed 7 demo respondents（讓 stats 有豐富樣本 + admin 後台有可疑可審）──
          const D1_ID = '99999999-9999-9999-9999-999999999901';
          const D2_ID = '99999999-9999-9999-9999-999999999902';
          const D3_ID = '99999999-9999-9999-9999-999999999903';
          const D4_ID = '99999999-9999-9999-9999-999999999904';
          const D5_ID = '99999999-9999-9999-9999-999999999905';
          const D6_ID = '99999999-9999-9999-9999-999999999906';
          const D7_ID = '99999999-9999-9999-9999-999999999907';
          await client.exec(`
            INSERT INTO users (id, email, password_hash, role, status, display_name, email_verified, role_selected_at)
            VALUES
              ('${D1_ID}', 'demo-1@dev.local', '${aaHash}', 'respondent', 'active', '張小明', true, NOW()),
              ('${D2_ID}', 'demo-2@dev.local', '${aaHash}', 'respondent', 'active', '林美琪', true, NOW()),
              ('${D3_ID}', 'demo-3@dev.local', '${aaHash}', 'respondent', 'active', '王大華', true, NOW()),
              ('${D4_ID}', 'demo-4@dev.local', '${aaHash}', 'respondent', 'active', '陳怡君', true, NOW()),
              ('${D5_ID}', 'demo-5@dev.local', '${aaHash}', 'respondent', 'active', '黃志強', true, NOW()),
              ('${D6_ID}', 'demo-6@dev.local', '${aaHash}', 'respondent', 'active', '李雅婷', true, NOW()),
              ('${D7_ID}', 'demo-7@dev.local', '${aaHash}', 'respondent', 'active', '吳建宏', true, NOW())
            ON CONFLICT (email) DO NOTHING;
          `);

          // ── Seed notifications (so navbar bell shows unread count) ──
          await client.exec(`
            INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
            VALUES
              ('66666666-6666-6666-6666-666666666601', '${AA_ID}', 'reward_issued',  '獎勵已入帳 NT$80',
                '你完成的「健身 App 體驗」獎勵 NT$80 已存入錢包，可隨時提領。',
                false, NOW() - INTERVAL '2 days'),
              ('66666666-6666-6666-6666-666666666602', '${AA_ID}', 'reward_issued',  '獎勵已入帳 NT$50',
                '你完成的「上班族咖啡消費」獎勵 NT$50 已存入錢包。',
                false, NOW() - INTERVAL '4 days'),
              ('66666666-6666-6666-6666-666666666603', '${AA_ID}', 'system',         '歡迎加入券問！',
                '完成個人資料填寫可以提升媒合精準度，立即賺取更多獎勵。',
                true,  NOW() - INTERVAL '10 days'),
              ('66666666-6666-6666-6666-666666666611', '${BB_ID}', 'new_response',   '你的問卷收到新填答',
                '「大學生外送習慣調查」剛剛有一位受試者完成填答。',
                false, NOW() - INTERVAL '1 hours'),
              ('66666666-6666-6666-6666-666666666612', '${BB_ID}', 'survey_approved','問卷審核通過',
                '「上班族咖啡消費」已通過 AI 品質審核並上架。',
                false, NOW() - INTERVAL '3 days')
            ON CONFLICT (id) DO NOTHING;
          `);

          // ── Seed sample surveys (3 published by bb, so aa sees them in /tasks) ──
          const SURVEY_IDS = [
            '33333333-3333-3333-3333-333333333301',
            '33333333-3333-3333-3333-333333333302',
            '33333333-3333-3333-3333-333333333303',
          ];
          await client.exec(`
            INSERT INTO surveys (id, surveyor_id, title, description, status, reward_points, target_count, completed_count, expires_at, is_anonymous, published_at)
            VALUES
              ('${SURVEY_IDS[0]}', '${BB_ID}',
                '大學生使用外送平台習慣調查',
                '了解大學生點外送的頻率、品牌偏好、消費金額。完成可獲 30 元 7-11 禮券。',
                'published', 30, 100, 12, NOW() + INTERVAL '14 days', true, NOW()),
              ('${SURVEY_IDS[1]}', '${BB_ID}',
                '上班族咖啡消費習慣',
                '研究台北上班族每週咖啡消費的習慣與品牌忠誠度。約 5 分鐘可填完。',
                'published', 50, 50, 8, NOW() + INTERVAL '7 days', true, NOW()),
              ('${SURVEY_IDS[2]}', '${BB_ID}',
                '健身運動 App 使用體驗',
                '若您過去 30 天有使用健身相關 App，歡迎分享您的使用體驗。',
                'published', 80, 30, 5, NOW() + INTERVAL '21 days', true, NOW()),
              -- 兩份待審：admin 後台「問卷審核」頁的測試資料
              ('33333333-3333-3333-3333-333333333304', '${BB_ID}',
                '網購回購率調查（待審）',
                '了解消費者對網購平台的回購意願與品牌忠誠度。',
                'pending_review', 60, 50, 0, NOW() + INTERVAL '14 days', true, NULL),
              ('33333333-3333-3333-3333-333333333305', '${BB_ID}',
                '租屋族居住痛點訪談（待審）',
                '針對台北雙北 25-40 歲租屋族，了解居住相關問題。',
                'pending_review', 100, 40, 0, NOW() + INTERVAL '30 days', true, NULL)
            ON CONFLICT (id) DO NOTHING;
          `);

          // ── Seed minimal questions for survey 1 (so it's clickable & fillable) ──
          await client.exec(`
            INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
            VALUES
              ('44444444-4444-4444-4444-444444440101', '${SURVEY_IDS[0]}', 'single_choice', '您一週點外送的頻率？', 1, true),
              ('44444444-4444-4444-4444-444444440102', '${SURVEY_IDS[0]}', 'multiple_choice', '您經常使用的外送平台（可複選）', 2, true),
              ('44444444-4444-4444-4444-444444440103', '${SURVEY_IDS[0]}', 'rating', '您對外送品質的整體滿意度', 3, true),
              ('44444444-4444-4444-4444-444444440104', '${SURVEY_IDS[0]}', 'text', '您希望外送平台改善哪些地方？', 4, false)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO question_options (question_id, label, sort_order) VALUES
              ('44444444-4444-4444-4444-444444440101', '幾乎不點', 1),
              ('44444444-4444-4444-4444-444444440101', '每週 1-2 次', 2),
              ('44444444-4444-4444-4444-444444440101', '每週 3-5 次', 3),
              ('44444444-4444-4444-4444-444444440101', '每天都點', 4),
              ('44444444-4444-4444-4444-444444440102', 'Uber Eats', 1),
              ('44444444-4444-4444-4444-444444440102', 'foodpanda', 2),
              ('44444444-4444-4444-4444-444444440102', 'Lalamove', 3),
              ('44444444-4444-4444-4444-444444440102', '其他', 4);
          `);

          // ── pending_review survey #4 questions (網購回購率) ──
          await client.exec(`
            INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
            VALUES
              ('44444444-4444-4444-4444-444444440401', '33333333-3333-3333-3333-333333333304', 'single_choice', '您每個月在網購平台消費的金額？', 1, true),
              ('44444444-4444-4444-4444-444444440402', '33333333-3333-3333-3333-333333333304', 'multiple_choice', '您經常使用哪些網購平台？（可複選）', 2, true),
              ('44444444-4444-4444-4444-444444440403', '33333333-3333-3333-3333-333333333304', 'rating', '對網購整體體驗的滿意度', 3, true),
              ('44444444-4444-4444-4444-444444440404', '33333333-3333-3333-3333-333333333304', 'text', '影響您回購意願最主要的因素是什麼？', 4, false)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO question_options (question_id, label, sort_order) VALUES
              ('44444444-4444-4444-4444-444444440401', '500 元以下', 1),
              ('44444444-4444-4444-4444-444444440401', '500-2000 元', 2),
              ('44444444-4444-4444-4444-444444440401', '2000-5000 元', 3),
              ('44444444-4444-4444-4444-444444440401', '5000 元以上', 4),
              ('44444444-4444-4444-4444-444444440402', '蝦皮 Shopee', 1),
              ('44444444-4444-4444-4444-444444440402', 'PChome', 2),
              ('44444444-4444-4444-4444-444444440402', 'Momo', 3),
              ('44444444-4444-4444-4444-444444440402', 'Yahoo 拍賣', 4),
              ('44444444-4444-4444-4444-444444440402', '其他', 5);
          `);

          // ── pending_review survey #5 questions (租屋族訪談) ──
          await client.exec(`
            INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
            VALUES
              ('44444444-4444-4444-4444-444444440501', '33333333-3333-3333-3333-333333333305', 'single_choice', '您目前的居住狀況？', 1, true),
              ('44444444-4444-4444-4444-444444440502', '33333333-3333-3333-3333-333333333305', 'single_choice', '您每月房租支出佔薪水的比例？', 2, true),
              ('44444444-4444-4444-4444-444444440503', '33333333-3333-3333-3333-333333333305', 'multiple_choice', '您在租屋時最在意哪些問題？（可複選）', 3, true),
              ('44444444-4444-4444-4444-444444440504', '33333333-3333-3333-3333-333333333305', 'rating', '對目前居住環境的整體滿意度', 4, true),
              ('44444444-4444-4444-4444-444444440505', '33333333-3333-3333-3333-333333333305', 'text', '如果可以改變一件租屋體驗，您最想改變什麼？', 5, false)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO question_options (question_id, label, sort_order) VALUES
              ('44444444-4444-4444-4444-444444440501', '套房', 1),
              ('44444444-4444-4444-4444-444444440501', '雅房', 2),
              ('44444444-4444-4444-4444-444444440501', '整層住家', 3),
              ('44444444-4444-4444-4444-444444440501', '與家人同住', 4),
              ('44444444-4444-4444-4444-444444440502', '20% 以下', 1),
              ('44444444-4444-4444-4444-444444440502', '20-30%', 2),
              ('44444444-4444-4444-4444-444444440502', '30-50%', 3),
              ('44444444-4444-4444-4444-444444440502', '50% 以上', 4),
              ('44444444-4444-4444-4444-444444440503', '房東態度', 1),
              ('44444444-4444-4444-4444-444444440503', '設備老舊', 2),
              ('44444444-4444-4444-4444-444444440503', '安全性', 3),
              ('44444444-4444-4444-4444-444444440503', '交通便利', 4),
              ('44444444-4444-4444-4444-444444440503', '租金漲幅', 5),
              ('44444444-4444-4444-4444-444444440503', '押金處理', 6);
          `);

          // ── Seed survey responses (aa completed survey-1, plus 2 demo respondents) ──
          await client.exec(`
            INSERT INTO survey_responses
              (id, survey_id, respondent_id, status, started_at, submitted_at, fill_duration_seconds, anti_cheat_score, suspicious_flags)
            VALUES
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
                '${SURVEY_IDS[0]}', '${AA_ID}', 'rewarded',
                NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
                185, 8, NULL),
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
                '${SURVEY_IDS[0]}', '${D1_ID}', 'submitted',
                NOW() - INTERVAL '1 hours', NOW() - INTERVAL '1 hours',
                12, 87, '["填答耗時過短","選項分佈過於規律"]'::jsonb),
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
                '${SURVEY_IDS[1]}', '${D2_ID}', 'rewarded',
                NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days',
                240, 12, NULL)
            ON CONFLICT (survey_id, respondent_id) DO NOTHING;
          `);

          // ── Seed actual answers for aa's response (survey-1 has full questions) ──
          await client.exec(`
            INSERT INTO response_answers (response_id, question_id, selected_option_ids, rating_value, text_answer)
            VALUES
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '44444444-4444-4444-4444-444444440101',
                '[]'::jsonb, NULL, NULL),
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '44444444-4444-4444-4444-444444440103',
                NULL, 4, NULL),
              ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '44444444-4444-4444-4444-444444440104',
                NULL, NULL, '希望加快配送速度，選項更多樣化');
          `);

          // ── 為 demo-3..demo-7 新增對 survey-1 的完整填答（不同情緒/不同選項，模擬真實樣本）──
          // 需要從 select_option_ids 取真實選項 ID。先 query 出來：
          const q1OptsRows = await client.query<{ id: string; sort_order: number }>(`
            SELECT id::text, sort_order FROM question_options
            WHERE question_id = '44444444-4444-4444-4444-444444440101'
            ORDER BY sort_order
          `);
          const q2OptsRows = await client.query<{ id: string; sort_order: number }>(`
            SELECT id::text, sort_order FROM question_options
            WHERE question_id = '44444444-4444-4444-4444-444444440102'
            ORDER BY sort_order
          `);
          const q1Opts = q1OptsRows.rows.map((r) => r.id);
          const q2Opts = q2OptsRows.rows.map((r) => r.id);

          // 5 個 demo response + answers
          const demoFillData: Array<{
            uid: string;
            rid: string;
            q1Pick: number;   // index into q1Opts
            q2Picks: number[]; // indices into q2Opts
            rating: number;
            text: string;
          }> = [
            { uid: D3_ID, rid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
              q1Pick: 2, q2Picks: [0, 1], rating: 5,
              text: '外送平台超方便，加碼活動很值得！' },
            { uid: D4_ID, rid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12',
              q1Pick: 1, q2Picks: [0], rating: 3,
              text: '價格再降一點就完美了，目前手續費偏高' },
            { uid: D5_ID, rid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa13',
              q1Pick: 2, q2Picks: [1, 2], rating: 4,
              text: '希望可以有更多素食餐廳選項' },
            { uid: D6_ID, rid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14',
              q1Pick: 0, q2Picks: [3], rating: 2,
              text: '配送時間常常 delay 太久，外送員態度也參差不齊' },
            { uid: D7_ID, rid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa15',
              q1Pick: 1, q2Picks: [0, 1, 2], rating: 4,
              text: '整體還不錯，但希望有更好的客服回覆速度' },
          ];

          for (const d of demoFillData) {
            const q2Selected = d.q2Picks.map((i) => q2Opts[i]).filter(Boolean);
            await client.exec(`
              INSERT INTO survey_responses
                (id, survey_id, respondent_id, status, started_at, submitted_at, fill_duration_seconds, anti_cheat_score)
              VALUES (
                '${d.rid}', '33333333-3333-3333-3333-333333333301', '${d.uid}', 'rewarded',
                NOW() - INTERVAL '${Math.floor(Math.random() * 7) + 1} days',
                NOW() - INTERVAL '${Math.floor(Math.random() * 7) + 1} days',
                ${Math.floor(Math.random() * 240) + 90}, ${Math.floor(Math.random() * 30)}
              )
              ON CONFLICT (survey_id, respondent_id) DO NOTHING;
            `);
            await client.exec(`
              INSERT INTO response_answers (response_id, question_id, selected_option_ids, rating_value, text_answer)
              VALUES
                ('${d.rid}', '44444444-4444-4444-4444-444444440101',
                  '["${q1Opts[d.q1Pick] ?? ''}"]'::jsonb, NULL, NULL),
                ('${d.rid}', '44444444-4444-4444-4444-444444440102',
                  '${JSON.stringify(q2Selected)}'::jsonb, NULL, NULL),
                ('${d.rid}', '44444444-4444-4444-4444-444444440103',
                  NULL, ${d.rating}, NULL),
                ('${d.rid}', '44444444-4444-4444-4444-444444440104',
                  NULL, NULL, '${d.text.replace(/'/g, "''")}');
            `);
          }

          // 同步 survey-1 completed_count → 6 筆（aa + 5 demo），舊值是 12 為 fake
          await client.exec(`
            UPDATE surveys
            SET completed_count = 6
            WHERE id = '33333333-3333-3333-3333-333333333301';
          `);

          // ── Phase 3: 預先寫入 quality_score（模擬 pipeline 跑完，避免啟動時打 LLM）──
          await client.exec(`
            UPDATE survey_responses SET
              quality_score = CASE id
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01' THEN 83
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02' THEN 31
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03' THEN 88
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11' THEN 92
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12' THEN 78
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa13' THEN 85
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14' THEN 68
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa15' THEN 81
              END,
              quality_breakdown = CASE id
                WHEN 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02' THEN
                  '{"behaviorScore":31,"finalScore":31,"status":"rejected","flags":["填答時間過短（12s）","回答題數遠少於總題數"]}'::jsonb
                ELSE
                  '{"finalScore":83,"status":"passed","flags":[]}'::jsonb
              END
            WHERE id IN (
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa13',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14',
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa15'
            );
          `);

          // Phase J 修：seed PII 加密 helper（與 CryptoService 同邏輯，dev fallback key）
          const { createCipheriv, randomBytes, scryptSync } = await import('crypto');
          const piiRaw = process.env.PII_ENCRYPTION_KEY ?? 'dev-fallback-pii-key-do-not-use-in-prod';
          const piiKey = scryptSync(piiRaw, 'quanwen-salt', 32);
          const seedEncrypt = (plain: string): string => {
            const iv = randomBytes(12);
            const c = createCipheriv('aes-256-gcm', piiKey, iv);
            const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
            const tag = c.getAuthTag();
            return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
          };

          // ── Phase C demo seed：appeals / KYC / reputation_history ──
          // 把 aa02（低品質）改為 rejected 才能觸發申訴流程
          await client.exec(`
            UPDATE survey_responses
              SET status = 'rejected'
              WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02';
          `);

          // 一筆 pending 申訴（D1 對自己被退件的填答提申訴）
          await client.exec(`
            INSERT INTO response_appeals
              (id, response_id, respondent_id, reason, status, created_at)
            VALUES
              ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
                '${D1_ID}',
                '我確實有認真填寫，只是當時手機電量不足急著按完，請重審',
                'pending',
                NOW() - INTERVAL '30 minutes')
            ON CONFLICT (response_id) DO NOTHING;
          `);

          // 一筆 D1 的 pending KYC（demo admin 可審）— Phase J：seed PII 用 seedEncrypt 加密
          const seedKycId = seedEncrypt('F213456789');     // 假身分證（F=台北市男性）
          const seedKycName = seedEncrypt('林美琪');
          const seedKycPhone = seedEncrypt('0912345678');
          await client.exec(`
            INSERT INTO kyc_verifications
              (id, user_id, status, id_number_cipher, real_name_cipher, phone_cipher, submitted_at, created_at)
            VALUES
              ('cccccccc-cccc-cccc-cccc-cccccccccc01',
                '${D2_ID}',
                'submitted',
                '${seedKycId}',
                '${seedKycName}',
                '${seedKycPhone}',
                NOW() - INTERVAL '2 hours',
                NOW() - INTERVAL '2 hours')
            ON CONFLICT (user_id) DO NOTHING;
          `);

          // 受試者 aa 的 reputation_history：5 筆顯示趨勢
          await client.exec(`
            INSERT INTO reputation_history (user_id, delta, new_score, reason, created_at)
            VALUES
              ('${AA_ID}',  1, 61, '完成 10 份問卷',   NOW() - INTERVAL '20 days'),
              ('${AA_ID}',  1, 62, '完成 20 份問卷',   NOW() - INTERVAL '15 days'),
              ('${AA_ID}', -5, 57, '填答未通過品質審核', NOW() - INTERVAL '10 days'),
              ('${AA_ID}',  5, 62, '申訴通過補償',     NOW() - INTERVAL '9 days'),
              ('${AA_ID}',  1, 63, '完成 30 份問卷',   NOW() - INTERVAL '3 days');
          `);

          console.log('✅ PGlite in-memory DB initialized');
          console.log('🔑 Dev seed accounts:');
          console.log('   📨 aa@aa.aa / aa  (respondent)');
          console.log('   📨 bb@bb.bb / bb  (surveyor)');
          console.log('   📨 cc@cc.cc / cc  (admin)');
          console.log('📋 Seeded 3 sample published surveys + profiles + notifications');
          return drizzlePg(client, { schema }) as unknown as AppDb;
        }

        // 真實 PostgreSQL
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 2_000,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
