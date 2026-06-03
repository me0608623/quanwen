import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import type { NotificationsService } from '../notifications/notifications.service';
import type { WalletService } from '../wallet/wallet.service';
import type { SuspiciousAnalyzerService } from './suspicious-analyzer.service';
import type { QualityAuditService } from '../responses/quality-audit.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AdminService, lotteryObligationPriority } from './admin.service';

describe('lotteryObligationPriority', () => {
  it('prioritizes winner issues, then overdue cases, then unverified cases', () => {
    expect(lotteryObligationPriority({ recipientStatus: 'issue_reported', isOverdue: false, platformVerifiedAt: null })).toBe(0);
    expect(lotteryObligationPriority({ recipientStatus: 'awaiting_delivery', isOverdue: true, platformVerifiedAt: null })).toBe(1);
    expect(lotteryObligationPriority({ recipientStatus: 'awaiting_delivery', isOverdue: false, platformVerifiedAt: null })).toBe(2);
    expect(lotteryObligationPriority({ recipientStatus: 'received', isOverdue: false, platformVerifiedAt: new Date() })).toBe(3);
  });
});

describe('AdminService lottery guarantee (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AdminService;
  const notifications: Array<{ userId: string; title: string; body?: string }> = [];
  let failInterventionNotification: boolean;
  let alwaysFailInterventionNotification: boolean;
  let interventionNotificationFailed: boolean;
  let failVerificationNotification: boolean;
  let verificationNotificationFailed: boolean;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    await client.exec(`
      CREATE TYPE transaction_type AS ENUM (
        'deposit','reward_out','reward_in','platform_fee',
        'withdraw_request','withdraw_complete','refund','points_in','points_spend'
      );
      CREATE TYPE transaction_status AS ENUM ('pending','processing','success','failed','cancelled');
      CREATE TABLE transactions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL REFERENCES users(id),
        type                transaction_type NOT NULL,
        amount              INTEGER NOT NULL,
        status              transaction_status NOT NULL DEFAULT 'pending',
        related_survey_id   UUID REFERENCES surveys(id),
        related_response_id UUID REFERENCES survey_responses(id)
      );
    `);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AdminService(
      db,
      {
        create: async (dto: { userId: string; title: string; body?: string }) => {
          if ((alwaysFailInterventionNotification || (failInterventionNotification && !interventionNotificationFailed)) && dto.title.includes('平台已介入')) {
            interventionNotificationFailed = true;
            throw new Error('platform intervention notification unavailable');
          }
          if (failVerificationNotification && !verificationNotificationFailed && dto.title.includes('獎品履約已由平台核驗')) {
            verificationNotificationFailed = true;
            throw new Error('platform verification notification unavailable');
          }
          notifications.push(dto);
        },
      } as unknown as NotificationsService,
      {} as WalletService,
      {} as SuspiciousAnalyzerService,
      {} as QualityAuditService,
    );
    notifications.length = 0;
    failInterventionNotification = false;
    alwaysFailInterventionNotification = false;
    interventionNotificationFailed = false;
    failVerificationNotification = false;
    verificationNotificationFailed = false;
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('11111111-1111-1111-1111-111111111111', 'creator@example.com', 'surveyor', 'Creator'),
        ('22222222-2222-2222-2222-222222222222', 'winner@example.com', 'respondent', 'Winner'),
        ('44444444-4444-4444-4444-444444444444', 'admin@example.com', 'admin', 'Admin');
      INSERT INTO surveys (id, surveyor_id, title, reward_mode, lottery_prize, lottery_winner_count, lottery_draw_mode, lottery_drawn_at, lottery_terms_accepted_at, lottery_obligation_notified_at)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '餐券抽獎', 'lottery', '餐券', 1, 'manual', NOW(), NOW(), NOW());
      INSERT INTO survey_responses (id, survey_id, respondent_id, status)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'submitted');
      INSERT INTO survey_lottery_results (id, survey_id, response_id, respondent_id, is_winner, prize, fulfillment_status, draw_notified_at, fulfillment_notified_at)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', true, '餐券', 'notified', NOW(), NOW());
    `);
  });

  afterEach(async () => client.close());

  it('exposes notification delivery markers for platform audit', async () => {
    const [obligation] = await service.getLotteryObligations();

    expect(obligation.creatorObligationNotifiedAt).not.toBeNull();
    expect(obligation.drawNotifiedAt).not.toBeNull();
    expect(obligation.fulfillmentNotifiedAt).not.toBeNull();
    expect(obligation.lotteryTermsAcceptedAt).not.toBeNull();
  });

  it('requires recipient confirmation before platform verification', async () => {
    await expect(service.verifyLotteryFulfillment(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
    )).rejects.toThrow('中獎者尚未確認收到獎品');

    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'received', recipientConfirmedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    await service.verifyLotteryFulfillment(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
    );

    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.fulfillmentStatus).toBe('verified');
    expect(result.platformVerifiedAt).not.toBeNull();
    expect(result.platformVerifiedNotifiedAt).not.toBeNull();
    expect(notifications).toHaveLength(2);
  });

  it('retries failed platform verification notifications before marking delivery', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'received', recipientConfirmedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    failVerificationNotification = true;

    await service.verifyLotteryFulfillment(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
    );

    let [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformVerifiedNotifiedAt).toBeNull();

    await service.retryPendingLotteryVerificationNotifications();
    [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformVerifiedNotifiedAt).not.toBeNull();
    expect(notifications).toHaveLength(2);
  });

  it('claims concurrent platform verification only once', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'received', recipientConfirmedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));

    const attempts = await Promise.allSettled([
      service.verifyLotteryFulfillment(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '44444444-4444-4444-4444-444444444444',
      ),
      service.verifyLotteryFulfillment(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '44444444-4444-4444-4444-444444444444',
      ),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(notifications).toHaveLength(2);
  });

  it('records platform intervention after the winner reports an issue', async () => {
    await expect(service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台已聯絡建立者',
    )).rejects.toThrow('中獎者尚未回報問題且履約期限尚未逾期');

    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'issue_reported', recipientIssueNote: '尚未收到餐券', recipientIssueReportedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台已聯絡建立者，請於三日內補寄',
    );

    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformIntervenedAt).not.toBeNull();
    expect(result.platformInterventionNote).toContain('三日內補寄');
    expect(result.platformInterventionNotifiedAt).not.toBeNull();
    expect(result.platformInterventionHistory).toEqual([
      expect.objectContaining({
        adminId: '44444444-4444-4444-4444-444444444444',
        reason: 'winner_issue',
        note: '平台已聯絡建立者，請於三日內補寄',
      }),
    ]);
    expect(notifications).toHaveLength(2);
  });

  it('rejects blank or oversized platform intervention notes', async () => {
    await expect(service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '   ',
    )).rejects.toThrow('平台介入說明需為 5 至 500 字');
    await expect(service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      'x'.repeat(501),
    )).rejects.toThrow('平台介入說明需為 5 至 500 字');
  });

  it('appends each platform intervention without overwriting prior audit evidence', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'issue_reported', recipientIssueNote: '尚未收到餐券', recipientIssueReportedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));

    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台第一次聯絡建立者',
    );
    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台第二次要求限期補寄',
    );

    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformInterventionNote).toBe('平台第二次要求限期補寄');
    expect(result.platformInterventionHistory).toEqual([
      expect.objectContaining({ note: '平台第一次聯絡建立者' }),
      expect.objectContaining({ note: '平台第二次要求限期補寄' }),
    ]);
    expect(notifications).toHaveLength(4);
  });

  it('does not overwrite an intervention whose notification is still pending', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({
        recipientStatus: 'issue_reported',
        recipientIssueNote: '尚未收到餐券',
        recipientIssueReportedAt: new Date(),
        platformIntervenedAt: new Date(),
        platformIntervenedBy: '44444444-4444-4444-4444-444444444444',
        platformInterventionNote: '前次平台通知仍待補送',
        platformInterventionNotifiedAt: null,
        platformInterventionHistory: [{
          intervenedAt: new Date().toISOString(),
          adminId: '44444444-4444-4444-4444-444444444444',
          reason: 'winner_issue',
          note: '前次平台通知仍待補送',
        }],
      })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    alwaysFailInterventionNotification = true;

    await expect(service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '不應覆蓋前次通知的新說明',
    )).rejects.toThrow('前次平台介入通知仍待補送');

    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformInterventionNote).toBe('前次平台通知仍待補送');
    expect(result.platformInterventionHistory).toHaveLength(1);
  });

  it('claims concurrent platform intervention only once', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'issue_reported', recipientIssueNote: '尚未收到餐券', recipientIssueReportedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));

    const attempts = await Promise.allSettled([
      service.interveneLotteryIssue(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '44444444-4444-4444-4444-444444444444',
        '平台管理員甲要求補寄',
      ),
      service.interveneLotteryIssue(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '44444444-4444-4444-4444-444444444444',
        '平台管理員乙要求補寄',
      ),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformInterventionHistory).toHaveLength(1);
    expect(notifications).toHaveLength(2);
  });

  it('allows proactive platform intervention after the fulfillment deadline', async () => {
    await db
      .update(schema.surveys)
      .set({ lotteryDrawnAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台主動聯絡建立者，要求補交獎品',
    );

    const [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformIntervenedAt).not.toBeNull();
    expect(result.platformInterventionNotifiedAt).not.toBeNull();
    expect(result.platformInterventionHistory).toEqual([
      expect.objectContaining({ reason: 'fulfillment_overdue' }),
    ]);
    expect(notifications).toHaveLength(2);
  });

  it('keeps the original overdue reason when retrying after the winner also reports an issue', async () => {
    await db
      .update(schema.surveys)
      .set({ lotteryDrawnAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    alwaysFailInterventionNotification = true;
    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台主動聯絡建立者，要求補交獎品',
    );

    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'issue_reported', recipientIssueNote: '仍未收到獎品', recipientIssueReportedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    alwaysFailInterventionNotification = false;
    await service.retryPendingLotteryInterventionNotifications();

    const creatorNotification = notifications.find((notification) =>
      notification.userId === '11111111-1111-1111-1111-111111111111'
      && notification.title.includes('平台已介入'));
    expect(creatorNotification?.body).toContain('案件已超過履約期限');
  });

  it('retries failed platform intervention notifications before marking delivery', async () => {
    await db
      .update(schema.surveyLotteryResults)
      .set({ recipientStatus: 'issue_reported', recipientIssueNote: '尚未收到餐券', recipientIssueReportedAt: new Date() })
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    failInterventionNotification = true;

    await service.interveneLotteryIssue(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '44444444-4444-4444-4444-444444444444',
      '平台已聯絡建立者，請於三日內補寄',
    );

    let [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformInterventionNotifiedAt).toBeNull();

    await service.retryPendingLotteryInterventionNotifications();
    [result] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    expect(result.platformInterventionNotifiedAt).not.toBeNull();
    expect(notifications).toHaveLength(2);
  });

  it('releases quota when an accepted lottery response is rejected before the draw', async () => {
    await db.delete(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
    await db
      .update(schema.surveys)
      .set({ status: 'closed', completedCount: 1, lotteryDrawnAt: null })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    await service.rejectResponse('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    const [response] = await db
      .select()
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
    expect(survey.completedCount).toBe(0);
    expect(survey.status).toBe('published');
    expect(response.status).toBe('rejected');
  });

  it('does not rewrite lottery participation evidence after the draw', async () => {
    await expect(service.rejectResponse(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    )).rejects.toThrow('抽獎已完成，無法改寫參與名單');

    const [response] = await db
      .select()
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
    expect(response.status).toBe('submitted');
  });

  it('does not fake a rollback after a fixed reward has already been paid', async () => {
    await client.exec(`
      INSERT INTO surveys (id, surveyor_id, title, reward_mode, reward_points, target_count, completed_count, status)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', '固定獎勵', 'fixed', 100, 1, 1, 'closed');
      INSERT INTO survey_responses (id, survey_id, respondent_id, status)
      VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'submitted');
      INSERT INTO transactions (user_id, type, amount, status, related_survey_id, related_response_id)
      VALUES ('22222222-2222-2222-2222-222222222222', 'reward_in', 100, 'success', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    `);

    await expect(service.rejectResponse(
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    )).rejects.toThrow('獎勵已入帳，需先處理款項追回後才能拒絕填答');
  });

  it('lists pending manual reviews even when the anti-cheat score is below the threshold', async () => {
    await client.exec(`
      INSERT INTO surveys (id, surveyor_id, title, reward_mode, status)
      VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '人工待審問卷', 'fixed', 'published');
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, anti_cheat_score)
      VALUES ('99999999-9999-9999-9999-999999999999', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222', 'pending_review', 10);
    `);

    const rows = await service.getSuspiciousResponses();
    expect(rows).toContainEqual(expect.objectContaining({
      id: '99999999-9999-9999-9999-999999999999',
      surveyTitle: '人工待審問卷',
      status: 'pending_review',
      suspiciousFlags: [],
    }));
  });
});
