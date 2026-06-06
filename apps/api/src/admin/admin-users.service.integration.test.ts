import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import type { NotificationsService } from '../notifications/notifications.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AdminUsersService } from './admin-users.service';

const EXTRA_DDL = `
  CREATE TYPE transaction_type AS ENUM (
    'deposit','reward_out','reward_in','platform_fee',
    'withdraw_request','withdraw_complete','refund','points_in','points_spend'
  );
  CREATE TYPE transaction_status AS ENUM ('pending','processing','success','failed','cancelled');
  CREATE TABLE wallets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    cash_balance   INTEGER NOT NULL DEFAULT 0,
    locked_cash    INTEGER NOT NULL DEFAULT 0,
    points_balance INTEGER NOT NULL DEFAULT 0,
    version        INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                transaction_type NOT NULL,
    amount              INTEGER NOT NULL,
    status              transaction_status NOT NULL DEFAULT 'pending',
    external_provider   VARCHAR(50),
    external_ref        VARCHAR(200),
    related_survey_id   UUID REFERENCES surveys(id),
    related_response_id UUID REFERENCES survey_responses(id),
    note                TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
  );
  CREATE TYPE auth_provider AS ENUM ('email','google','line','apple');
  CREATE TABLE oauth_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            auth_provider NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    provider_email      VARCHAR(255),
    provider_avatar_url TEXT,
    access_token        TEXT,
    refresh_token       TEXT,
    token_expires_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TYPE appeal_status AS ENUM ('pending','approved','dismissed');
  CREATE TABLE response_appeals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id   UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason        TEXT NOT NULL,
    status        appeal_status NOT NULL DEFAULT 'pending',
    admin_note    VARCHAR(500),
    resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
  );
`;

describe('AdminUsersService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AdminUsersService;
  let notificationsSent: Array<{ userId: string; title: string }>;
  let failNotification: boolean;

  let adminId: string;
  let aliceId: string;
  let bobId: string;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    await client.exec(EXTRA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;

    notificationsSent = [];
    failNotification = false;
    const notifications = {
      create: async (dto: { userId: string; title: string }) => {
        if (failNotification) throw new Error('notification unavailable');
        notificationsSent.push({ userId: dto.userId, title: dto.title });
      },
    } as unknown as NotificationsService;

    service = new AdminUsersService(db, notifications);

    const [admin] = await db.insert(schema.users).values({
      email: 'admin@quanwen.com', role: 'admin', displayName: 'Admin',
    }).returning();
    const [alice] = await db.insert(schema.users).values({
      email: 'alice@example.com', role: 'respondent', displayName: 'Alice Chen',
    }).returning();
    const [bob] = await db.insert(schema.users).values({
      email: 'bob@example.com', role: 'surveyor', displayName: 'Bob Wang', status: 'suspended',
    }).returning();
    adminId = admin.id;
    aliceId = alice.id;
    bobId = bob.id;

    await db.insert(schema.wallets).values({ userId: aliceId, cashBalance: 500, pointsBalance: 30 });
    await db.insert(schema.oauthAccounts).values({
      userId: aliceId, provider: 'google', providerAccountId: 'g-123',
    });

    const [survey] = await db.insert(schema.surveys).values({
      surveyorId: bobId, title: '測試問卷', rewardPoints: 50,
    }).returning();
    const [resp] = await db.insert(schema.surveyResponses).values({
      surveyId: survey.id, respondentId: aliceId, status: 'rewarded', qualityScore: 90,
      submittedAt: new Date(),
    }).returning();
    await db.insert(schema.responseAppeals).values({
      responseId: resp.id, respondentId: aliceId, reason: '測試申訴理由',
    });
    await db.insert(schema.transactions).values({
      userId: aliceId, type: 'reward_in', amount: 50, status: 'success', note: '填答獎勵',
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('searchUsers', () => {
    it('searches by email fragment', async () => {
      const result = await service.searchUsers({ q: 'alice', page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.items[0].email).toBe('alice@example.com');
      expect(result.items[0].cashBalance).toBe(500);
      expect(result.items[0].responseCount).toBe(1);
    });

    it('searches by display name fragment', async () => {
      const result = await service.searchUsers({ q: 'Wang', page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.items[0].email).toBe('bob@example.com');
      expect(result.items[0].surveyCount).toBe(1);
    });

    it('filters by status', async () => {
      const result = await service.searchUsers({ status: 'suspended', page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe(bobId);
    });

    it('paginates with correct total', async () => {
      const result = await service.searchUsers({ page: 1, limit: 2 });
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      const page2 = await service.searchUsers({ page: 2, limit: 2 });
      expect(page2.items).toHaveLength(1);
    });
  });

  describe('getUserDetail', () => {
    it('returns wallet, oauth providers, stats, and recent activity', async () => {
      const detail = await service.getUserDetail(aliceId);
      expect(detail.user.email).toBe('alice@example.com');
      expect(detail.oauthProviders).toEqual(['google']);
      expect(detail.wallet).toMatchObject({ cashBalance: 500, pointsBalance: 30 });
      expect(detail.stats).toMatchObject({
        surveyCount: 0, responseCount: 1, approvedResponseCount: 1, appealCount: 1,
      });
      expect(detail.recentTransactions).toHaveLength(1);
      expect(detail.recentTransactions[0]).toMatchObject({ type: 'reward_in', amount: 50 });
      expect(detail.recentResponses).toHaveLength(1);
      expect(detail.recentResponses[0]).toMatchObject({ surveyTitle: '測試問卷', qualityScore: 90 });
    });

    it('throws NotFound for unknown user', async () => {
      await expect(service.getUserDetail('00000000-0000-0000-0000-000000000000'))
        .rejects.toThrow('使用者不存在');
    });
  });

  describe('suspendUser', () => {
    it('suspends user and sends notification', async () => {
      const result = await service.suspendUser(adminId, aliceId, '違規多帳號刷獎勵');
      expect(result.status).toBe('suspended');
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, aliceId));
      expect(row.status).toBe('suspended');
      expect(notificationsSent).toHaveLength(1);
      expect(notificationsSent[0].title).toContain('停權');
    });

    it('suspension persists even if notification fails', async () => {
      failNotification = true;
      const result = await service.suspendUser(adminId, aliceId, '違規多帳號刷獎勵');
      expect(result.status).toBe('suspended');
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, aliceId));
      expect(row.status).toBe('suspended');
    });

    it('rejects suspending an admin account', async () => {
      const [admin2] = await db.insert(schema.users).values({
        email: 'admin2@quanwen.com', role: 'admin', displayName: 'Admin2',
      }).returning();
      await expect(service.suspendUser(adminId, admin2.id, '測試停權理由'))
        .rejects.toThrow('不可停權管理員帳號');
    });

    it('rejects suspending self', async () => {
      await expect(service.suspendUser(adminId, adminId, '測試停權理由'))
        .rejects.toThrow('不可停權自己的帳號');
    });

    it('rejects double suspension', async () => {
      await expect(service.suspendUser(adminId, bobId, '測試停權理由'))
        .rejects.toThrow('此帳號已是停權狀態');
    });
  });

  describe('unsuspendUser', () => {
    it('restores suspended user to active', async () => {
      const result = await service.unsuspendUser(adminId, bobId);
      expect(result.status).toBe('active');
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, bobId));
      expect(row.status).toBe('active');
      expect(notificationsSent).toHaveLength(1);
      expect(notificationsSent[0].title).toContain('恢復');
    });

    it('rejects unsuspending an active user', async () => {
      await expect(service.unsuspendUser(adminId, aliceId))
        .rejects.toThrow('此帳號不是停權狀態');
    });
  });
});
