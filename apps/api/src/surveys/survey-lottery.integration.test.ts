import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import type { NotificationsService } from '../notifications/notifications.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { lotteryEligibleDigest, rankLotteryEntries, SurveyLotteryService, verifyLotteryAuditProof } from './survey-lottery.service';

describe('lottery audit proof', () => {
  it('creates a stable candidate digest and replayable ranking', () => {
    const entries = [{ responseId: 'b' }, { responseId: 'a' }, { responseId: 'c' }];
    expect(lotteryEligibleDigest(['b', 'a'])).toBe(lotteryEligibleDigest(['a', 'b']));
    expect(rankLotteryEntries(entries, 'fixed-seed')).toEqual(rankLotteryEntries([...entries].reverse(), 'fixed-seed'));
    const ranked = rankLotteryEntries(entries, 'fixed-seed');
    const results = entries.map((entry) => ({ ...entry, isWinner: entry.responseId === ranked[0].responseId }));
    expect(verifyLotteryAuditProof(results, 'fixed-seed', lotteryEligibleDigest(entries.map((entry) => entry.responseId)), 1)).toBe(true);
    expect(verifyLotteryAuditProof(results, 'fixed-seed', 'tampered', 1)).toBe(false);
  });
});

describe('SurveyLotteryService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveyLotteryService;
  const createdNotifications: Array<{ userId: string; title: string }> = [];
  let failDrawNotificationFor: string | null;
  let drawNotificationFailed: boolean;
  let failCreatorObligationNotification: boolean;
  let creatorObligationNotificationFailed: boolean;
  let failFulfillmentNotification: boolean;
  let fulfillmentNotificationFailed: boolean;
  let failIssueNotification: boolean;
  let issueNotificationFailed: boolean;
  let failOverdueNotification: boolean;
  let overdueNotificationFailed: boolean;
  let failReceiptConfirmationNotification: boolean;
  let receiptConfirmationNotificationFailed: boolean;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    const notifications = {
      create: async (dto: { userId: string; title: string }) => {
        if (
          dto.userId === failDrawNotificationFor
          && !drawNotificationFailed
          && (dto.title === '恭喜！您抽中問卷獎品' || dto.title === '問卷抽獎結果通知')
        ) {
          drawNotificationFailed = true;
          throw new Error('notification service unavailable');
        }
        if (
          failCreatorObligationNotification
          && !creatorObligationNotificationFailed
          && dto.title.includes('請履行獎品交付義務')
        ) {
          creatorObligationNotificationFailed = true;
          throw new Error('creator obligation notification unavailable');
        }
        if (
          failFulfillmentNotification
          && !fulfillmentNotificationFailed
          && dto.title.includes('抽獎兌獎通知')
        ) {
          fulfillmentNotificationFailed = true;
          throw new Error('fulfillment notification unavailable');
        }
        if (
          failIssueNotification
          && !issueNotificationFailed
          && dto.title === '中獎者回報尚未收到獎品'
        ) {
          issueNotificationFailed = true;
          throw new Error('issue notification unavailable');
        }
        if (
          failOverdueNotification
          && !overdueNotificationFailed
          && dto.title === '抽獎獎品履約已逾期'
        ) {
          overdueNotificationFailed = true;
          throw new Error('overdue notification unavailable');
        }
        if (
          failReceiptConfirmationNotification
          && !receiptConfirmationNotificationFailed
          && dto.title === '中獎者已確認收到獎品'
        ) {
          receiptConfirmationNotificationFailed = true;
          throw new Error('receipt confirmation notification unavailable');
        }
        createdNotifications.push(dto);
      },
    } as unknown as NotificationsService;
    service = new SurveyLotteryService(db, notifications);
    createdNotifications.length = 0;
    failDrawNotificationFor = null;
    drawNotificationFailed = false;
    failCreatorObligationNotification = false;
    creatorObligationNotificationFailed = false;
    failFulfillmentNotification = false;
    fulfillmentNotificationFailed = false;
    failIssueNotification = false;
    issueNotificationFailed = false;
    failOverdueNotification = false;
    overdueNotificationFailed = false;
    failReceiptConfirmationNotification = false;
    receiptConfirmationNotificationFailed = false;

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('11111111-1111-1111-1111-111111111111', 'creator@example.com', 'surveyor', 'Creator'),
        ('22222222-2222-2222-2222-222222222222', 'a@example.com', 'respondent', 'A'),
        ('33333333-3333-3333-3333-333333333333', 'b@example.com', 'respondent', 'B'),
        ('55555555-5555-5555-5555-555555555555', 'anon+legacy@guest.quanwen.local', 'respondent', 'Legacy Guest'),
        ('44444444-4444-4444-4444-444444444444', 'admin@example.com', 'admin', 'Admin');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, lottery_prize,
        lottery_winner_count, lottery_draw_mode, target_count, completed_count,
        lottery_terms_accepted_at
      ) VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        '餐券抽獎問卷', 'closed', 'lottery', '饗食天堂平日晚餐券',
        1, 'manual', 2, 2, NOW()
      );
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at, quality_score) VALUES
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'submitted', NOW(), 90),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'submitted', NOW(), 90),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'submitted', NOW(), 90);
    `);
  });

  afterEach(async () => {
    await client.close();
  });

  it('draws once, stores one winner and notifies every eligible respondent', async () => {
    const first = await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(first.participantCount).toBe(2);
    expect(first.actualWinnerCount).toBe(1);
    expect(first.drawSeed).toHaveLength(64);
    expect(first.eligibleDigest).toHaveLength(64);
    expect(first.drawAuditVerified).toBe(true);
    expect(first.creatorObligationNotifiedAt).not.toBeNull();
    expect(createdNotifications).toHaveLength(3);

    const rows = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.surveyId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isWinner)).toHaveLength(1);
    expect(rows.find((r) => r.isWinner)?.fulfillmentStatus).toBe('pending');
    const participantResults = [
      ...(await service.getMyLotteryResults('22222222-2222-2222-2222-222222222222')),
      ...(await service.getMyLotteryResults('33333333-3333-3333-3333-333333333333')),
    ];
    expect(participantResults).toHaveLength(2);
    expect(participantResults.filter((result) => result.isWinner)).toHaveLength(1);
    expect(participantResults.filter((result) => !result.isWinner)).toHaveLength(1);
    expect(participantResults.every((result) => result.drawAuditVerified)).toBe(true);
    expect(participantResults.every((result) => result.participantCount === 2)).toBe(true);
    expect(participantResults.every((result) => result.fulfillmentDueAt instanceof Date)).toBe(true);

    await db
      .update(schema.surveyLotteryResults)
      .set({ platformIntervenedAt: new Date(), platformInterventionNote: '平台客服已聯絡問卷建立者處理。' })
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    const winning = [
      ...(await service.getMyLotteryResults('22222222-2222-2222-2222-222222222222')),
      ...(await service.getMyLotteryResults('33333333-3333-3333-3333-333333333333')),
    ].find((result) => result.isWinner);
    expect(winning?.platformInterventionNote).toBe('平台客服已聯絡問卷建立者處理。');
    expect(winning?.platformIntervenedAt).not.toBeNull();

    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(createdNotifications).toHaveLength(3);
  });

  it('claims a concurrent draw only once', async () => {
    const summaries = await Promise.all([
      service.draw(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
      ),
      service.draw(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
      ),
    ]);
    const rows = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.surveyId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    expect(summaries.every((summary) => summary.participantCount === 2)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.isWinner)).toHaveLength(1);
    expect(createdNotifications).toHaveLength(3);
  });

  it('records creator fulfillment and notifies the winner', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    const summary = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請於七日內回覆通知信，平台客服將協助安排餐券寄送。',
    );

    expect(summary.winners).toHaveLength(1);
    expect(summary.winners[0].fulfillmentStatus).toBe('notified');
    expect(summary.winners[0].fulfilledAt).not.toBeNull();
    expect(summary.winners[0].fulfillmentNotifiedAt).not.toBeNull();
    expect(createdNotifications).toHaveLength(4);
    await expect(service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '再次送出不應重複通知。',
    )).rejects.toThrow('兌獎說明已送出');
    expect(createdNotifications).toHaveLength(4);
  });

  it('lets creators fulfill individual winners with unique redemption instructions', async () => {
    await db
      .update(schema.surveys)
      .set({ lotteryWinnerCount: 2 })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    const drawn = await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(drawn.winners).toHaveLength(2);

    const firstWinnerId = drawn.winners[0].id;
    const first = await service.fulfillWinner(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      firstWinnerId,
      '11111111-1111-1111-1111-111111111111',
      '電子餐券序號 A-1234，請於期限前至門市兌換。',
    );

    const firstWinner = first.winners.find((winner) => winner.id === firstWinnerId);
    const secondWinner = first.winners.find((winner) => winner.id !== firstWinnerId);
    expect(firstWinner?.fulfillmentStatus).toBe('notified');
    expect(firstWinner?.fulfillmentNote).toContain('A-1234');
    expect(secondWinner?.fulfillmentStatus).toBe('pending');
    expect(createdNotifications).toHaveLength(4);

    const all = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '電子餐券序號 B-5678，請於期限前至門市兌換。',
    );
    expect(all.winners.every((winner) => winner.fulfillmentStatus === 'notified')).toBe(true);
    expect(all.winners.find((winner) => winner.id === firstWinnerId)?.fulfillmentNote).toContain('A-1234');
    expect(all.winners.find((winner) => winner.id !== firstWinnerId)?.fulfillmentNote).toContain('B-5678');
    expect(createdNotifications).toHaveLength(5);
  });

  it('prevents creators from bypassing draw mode readiness rules', async () => {
    await db
      .update(schema.surveys)
      .set({ lotteryDrawMode: 'when_full', completedCount: 1 })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    await expect(service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('問卷尚未收滿');

    await db
      .update(schema.surveys)
      .set({ lotteryDrawMode: 'scheduled', lotteryDrawAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    await expect(service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('尚未到指定開獎時間');
  });

  it('waits for quality audit completion before drawing', async () => {
    await db
      .update(schema.surveys)
      .set({ status: 'published' })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    await db
      .update(schema.surveyResponses)
      .set({ qualityScore: null })
      .where(eq(schema.surveyResponses.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'));

    await expect(service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('仍有填答正在品質審核');

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.lotteryDrawnAt).toBeNull();
    expect(survey.status).toBe('published');
  });

  it('waits for pending manual review before drawing', async () => {
    await db
      .update(schema.surveyResponses)
      .set({ status: 'pending_review', qualityScore: 60 })
      .where(eq(schema.surveyResponses.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'));

    await expect(service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('仍有填答正在品質審核');

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.lotteryDrawnAt).toBeNull();
  });

  it('requires enough audited eligible entries for a full-collection draw', async () => {
    await db
      .update(schema.surveyResponses)
      .set({ status: 'rejected' })
      .where(eq(schema.surveyResponses.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'));

    await expect(service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('有效填答尚未收滿');

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.lotteryDrawnAt).toBeNull();
  });

  it('closes a scheduled survey as part of the draw transaction', async () => {
    await db
      .update(schema.surveys)
      .set({
        status: 'published',
        lotteryDrawMode: 'scheduled',
        lotteryDrawAt: new Date(Date.now() - 60_000),
        completedCount: 1,
      })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );

    const [survey] = await db
      .select({ status: schema.surveys.status })
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.status).toBe('closed');
  });

  it('draws from existing eligible participants after a survey closes before reaching its target', async () => {
    await db
      .update(schema.surveys)
      .set({ status: 'closed', completedCount: 2, targetCount: 3 })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

    await service.drawDueLotteries();

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    const results = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.surveyId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.lotteryDrawnAt).not.toBeNull();
    expect(results).toHaveLength(2);
    expect(results.filter((result) => result.isWinner)).toHaveLength(1);
  });

  it('retries a failed participant draw notification without drawing again', async () => {
    failDrawNotificationFor = '22222222-2222-2222-2222-222222222222';
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );

    let results = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.surveyId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(results.filter((result) => result.drawNotifiedAt)).toHaveLength(1);

    await service.retryPendingDrawNotifications();
    results = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.surveyId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(results.filter((result) => result.drawNotifiedAt)).toHaveLength(2);
    expect(createdNotifications.filter((notification) => notification.userId === failDrawNotificationFor)).toHaveLength(1);
  });

  it('retries a failed fulfillment instruction notification', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    failFulfillmentNotification = true;
    const first = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請於七日內回覆通知信，平台客服將協助安排餐券寄送。',
    );
    expect(first.winners[0].fulfillmentNotifiedAt).toBeNull();

    await service.retryPendingFulfillmentNotifications();
    const [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    expect(winner.fulfillmentNotifiedAt).not.toBeNull();
    expect(createdNotifications.filter((notification) => notification.title.includes('抽獎兌獎通知'))).toHaveLength(1);
  });

  it('retries a failed winner issue escalation notification', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    const fulfilled = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請於七日內回覆通知信，平台客服將協助安排餐券寄送。',
    );
    const [drawnWinner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    failIssueNotification = true;
    await service.reportIssue(fulfilled.winners[0].id, drawnWinner.respondentId, '尚未收到餐券，請平台協助。');

    let [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    expect(winner.recipientIssueNotifiedAt).toBeNull();

    await service.retryPendingIssueNotifications();
    [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    expect(winner.recipientIssueNotifiedAt).not.toBeNull();
    expect(createdNotifications.filter((notification) => notification.title === '中獎者回報尚未收到獎品')).toHaveLength(2);
  });

  it('retries a failed creator obligation notification without drawing again', async () => {
    failCreatorObligationNotification = true;
    const first = await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(first.creatorObligationNotifiedAt).toBeNull();

    await service.retryPendingCreatorObligationNotifications();
    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    expect(survey.lotteryObligationNotifiedAt).not.toBeNull();
    expect(createdNotifications.filter((notification) => notification.userId === '11111111-1111-1111-1111-111111111111')).toHaveLength(1);
  });

  it('lets the winner report when creator instructions are overdue', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    await db
      .update(schema.surveys)
      .set({ lotteryDrawnAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) })
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
    const [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));

    await expect(service.reportIssue(winner.id, winner.respondentId, '建立者逾期尚未提供兌獎方式。'))
      .resolves.toEqual({ id: winner.id, recipientStatus: 'issue_reported' });
  });

  it('lets the winner confirm receipt and notifies creator plus admins', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    const fulfilled = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請依通知信內容完成餐券領取。',
    );
    const winnerId = fulfilled.winners[0].id;
    const winnerRows = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));

    await service.confirmReceipt(winnerId, winnerRows[0].respondentId);
    const [updated] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));
    expect(updated.recipientStatus).toBe('received');
    expect(updated.recipientConfirmedAt).not.toBeNull();
    expect(updated.recipientConfirmedNotifiedAt).not.toBeNull();
    expect(createdNotifications).toHaveLength(6);
  });

  it('retries a failed receipt confirmation notification before marking delivery', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    const fulfilled = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請依通知信內容完成餐券領取。',
    );
    const winnerId = fulfilled.winners[0].id;
    const [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));
    failReceiptConfirmationNotification = true;

    await service.confirmReceipt(winnerId, winner.respondentId);
    let [updated] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));
    expect(updated.recipientConfirmedNotifiedAt).toBeNull();

    await service.retryPendingReceiptConfirmationNotifications();
    [updated] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));
    expect(updated.recipientConfirmedNotifiedAt).not.toBeNull();
  });

  it('lets the winner report a missing prize for platform intervention', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    const fulfilled = await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請依通知信內容完成餐券領取。',
    );
    const winnerId = fulfilled.winners[0].id;
    const winnerRows = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));

    await service.reportIssue(winnerId, winnerRows[0].respondentId, '超過約定時間仍未收到餐券。');
    const [updated] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.id, winnerId));
    expect(updated.recipientStatus).toBe('issue_reported');
    expect(updated.recipientIssueNote).toContain('未收到');
    expect(createdNotifications).toHaveLength(6);
  });

  it('reminds the creator and platform admins once per day when fulfillment is overdue', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    await client.exec(`
      UPDATE surveys
      SET lottery_drawn_at = NOW() - INTERVAL '8 days'
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    `);

    await service.remindOverdueFulfillments();
    expect(createdNotifications).toHaveLength(6);
    expect(createdNotifications.map((notification) => notification.title)).toContain('抽獎獎品履約已逾期');
    expect(createdNotifications.map((notification) => notification.title)).toContain('平台保證案件逾期提醒');
    expect(createdNotifications.map((notification) => notification.title)).toContain('抽獎獎品履約逾期，平台已追蹤');

    await service.remindOverdueFulfillments();
    expect(createdNotifications).toHaveLength(6);
  });

  it('retries overdue fulfillment notifications before marking the reminder as sent', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    await client.exec(`
      UPDATE surveys
      SET lottery_drawn_at = NOW() - INTERVAL '8 days'
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    `);
    failOverdueNotification = true;

    await service.remindOverdueFulfillments();
    let [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    expect(winner.lastReminderAt).toBeNull();

    await service.remindOverdueFulfillments();
    [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    expect(winner.lastReminderAt).not.toBeNull();
    expect(createdNotifications.map((notification) => notification.title)).toContain('平台保證案件逾期提醒');
  });

  it('does not ask a winner who already confirmed receipt to report a missing prize', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    await service.fulfill(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '請依通知信內容完成餐券領取。',
    );
    const [winner] = await db
      .select()
      .from(schema.surveyLotteryResults)
      .where(eq(schema.surveyLotteryResults.isWinner, true));
    await service.confirmReceipt(winner.id, winner.respondentId);
    await client.exec(`
      UPDATE surveys
      SET lottery_drawn_at = NOW() - INTERVAL '8 days'
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    `);
    createdNotifications.length = 0;

    await service.remindOverdueFulfillments();

    expect(createdNotifications).toHaveLength(2);
    expect(createdNotifications.map((notification) => notification.title)).toContain('抽獎獎品履約已逾期');
    expect(createdNotifications.map((notification) => notification.title)).toContain('平台保證案件逾期提醒');
    expect(createdNotifications.map((notification) => notification.title)).not.toContain('抽獎獎品履約逾期，平台已追蹤');
  });

  it('does not send overdue reminders after platform verification is complete', async () => {
    await service.draw(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    );
    await client.exec(`
      UPDATE surveys
      SET lottery_drawn_at = NOW() - INTERVAL '8 days'
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      UPDATE survey_lottery_results
      SET platform_verified_at = NOW(), fulfillment_status = 'verified'
      WHERE is_winner = true;
    `);
    createdNotifications.length = 0;

    await service.remindOverdueFulfillments();

    expect(createdNotifications).toHaveLength(0);
  });
});
