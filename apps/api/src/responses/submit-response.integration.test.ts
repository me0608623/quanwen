import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { ResponsesService } from './responses.service';
import type { AntiCheatService } from './anti-cheat.service';
import type { WalletService } from '../wallet/wallet.service';
import type { CouponsService } from '../wallet/coupons.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QualityAuditService } from './quality-audit.service';
import type { ReputationService } from './reputation.service';
import type { SpinService } from '../spin/spin.service';
import { CryptoService } from '../common/crypto.service';

const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';
const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const SURVEY_ID = '33333333-3333-3333-3333-333333333333';
const QUESTION_ID = '44444444-4444-4444-4444-444444444444';

describe('ResponsesService.submitResponse pending_review gate', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ResponsesService;
  const issueReward = vi.fn(async () => undefined);
  const createNotification = vi.fn(async () => undefined);
  const sendRespondentThankYou = vi.fn(async () => undefined);

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES
        ('${RESPONDENT_ID}', 'respondent@test.local', 'respondent', 'Respondent'),
        ('${SURVEYOR_ID}', 'surveyor@test.local', 'surveyor', 'Surveyor');

      INSERT INTO respondent_profiles (user_id) VALUES ('${RESPONDENT_ID}');

      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${SURVEY_ID}', '${SURVEYOR_ID}', 'Test Survey', 'published', 100, 10, 0, NOW());

      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${QUESTION_ID}', '${SURVEY_ID}', 'text', 'Open text question', 0, true);
    `);

    db = drizzle(client, { schema });
    const antiCheat = {
      evaluate: () => ({ score: 10, flags: [] }),
    } as unknown as AntiCheatService;
    const wallet = { issueReward } as unknown as WalletService;
    const notifications = {
      create: createNotification,
      sendRespondentThankYou,
    } as unknown as NotificationsService;
    const qualityAudit = {
      audit: async () => ({
        behaviorScore: 60,
        signalScores: {
          timing: 60,
          attentionCheck: null,
          reverseConsistency: null,
          textQuality: 60,
          choicePattern: 60,
        },
        llmScore: null,
        llmReasoning: null,
        llmEvidence: [],
        finalScore: 60,
        status: 'suspicious',
        flags: [],
      }),
    } as unknown as QualityAuditService;
    const reputation = { adjust: async () => undefined } as unknown as ReputationService;
    const spin = { grantChance: async () => undefined } as unknown as SpinService;

    service = new ResponsesService(
      db as unknown as AppDb,
      antiCheat,
      wallet,
      { issueForResponse: async () => undefined } as unknown as CouponsService,
      notifications,
      qualityAudit,
      reputation,
      spin,
      new CryptoService(),
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  it('marks response as pending_review when openText length > 10 and does not issue reward', async () => {
    const result = await service.submitResponse(SURVEY_ID, RESPONDENT_ID, {
      answers: [
        {
          questionId: QUESTION_ID,
          textAnswer: 'this answer has more than ten chars',
        },
      ],
    });

    expect(result.flagged).toBe(true);
    expect(issueReward).not.toHaveBeenCalled();

    const rows = await db.select().from(schema.surveyResponses);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending_review');
  });

  it('stores optional fingerprintId without applying any blocking logic', async () => {
    const secondRespondentId = '11111111-1111-1111-1111-111111111112';
    const secondSurveyId = '33333333-3333-3333-3333-333333333334';
    const secondQuestionId = '44444444-4444-4444-4444-444444444445';

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${secondRespondentId}', 'respondent2@test.local', 'respondent', 'Respondent 2');
      INSERT INTO respondent_profiles (user_id) VALUES ('${secondRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${secondSurveyId}', '${SURVEYOR_ID}', 'Fingerprint Survey', 'published', 100, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${secondQuestionId}', '${secondSurveyId}', 'text', 'Fingerprint question', 0, true);
    `);

    await service.submitResponse(secondSurveyId, secondRespondentId, {
      answers: [{ questionId: secondQuestionId, textAnswer: 'short' }],
      fingerprintId: 'visitor_abc123',
    });

    const inserted = await db
      .select({ fingerprintId: schema.surveyResponses.fingerprintId, status: schema.surveyResponses.status })
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.surveyId, secondSurveyId));

    expect(inserted).toHaveLength(1);
    expect(inserted[0].fingerprintId).toBe('visitor_abc123');
  });

  it('rejects anonymous public submission for lottery surveys so draw notifications remain deliverable', async () => {
    const lotterySurveyId = '33333333-3333-3333-3333-333333333335';
    await client.exec(`
      INSERT INTO surveys (id, surveyor_id, title, status, reward_mode, lottery_prize, lottery_winner_count, lottery_draw_mode, target_count, completed_count, published_at)
      VALUES ('${lotterySurveyId}', '${SURVEYOR_ID}', 'Lottery Survey', 'published', 'lottery', '餐券', 1, 'when_full', 10, 0, NOW());
    `);

    await expect(service.submitPublicResponse(lotterySurveyId, { answers: [] }, 'anon-token'))
      .rejects.toThrow('抽獎問卷請登入後填答，以便接收開獎通知');
  });

  it('describes pending lottery review as eligibility review, not fixed reward payout', async () => {
    const lotterySurveyId = '33333333-3333-3333-3333-333333333356';
    const lotteryQuestionId = '44444444-4444-4444-4444-444444444466';
    const lotteryRespondentId = '11111111-1111-1111-1111-111111111136';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${lotteryRespondentId}', 'lottery-pending-copy@test.local', 'respondent', 'Lottery Pending Copy');
      INSERT INTO respondent_profiles (user_id) VALUES ('${lotteryRespondentId}');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, lottery_prize,
        lottery_winner_count, lottery_draw_mode, target_count, completed_count,
        published_at, lottery_terms_accepted_at
      )
      VALUES (
        '${lotterySurveyId}', '${SURVEYOR_ID}', 'Lottery Pending Copy Survey', 'published',
        'lottery', '餐券', 1, 'manual', 10, 0, NOW(), NOW()
      );
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${lotteryQuestionId}', '${lotterySurveyId}', 'text', 'Lottery pending copy question', 0, true);
    `);

    const result = await service.submitResponse(lotterySurveyId, lotteryRespondentId, {
      answers: [{ questionId: lotteryQuestionId, textAnswer: '這是一段需要人工複核的抽獎填答內容' }],
    });

    expect(result.message).toContain('抽獎資格');
    expect(result.message).not.toContain('發放獎勵');
  });

  it('marks rewarded responses as already submitted in public survey details', async () => {
    const rewardedSurveyId = '33333333-3333-3333-3333-333333333350';
    const rewardedRespondentId = '11111111-1111-1111-1111-111111111130';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${rewardedRespondentId}', 'rewarded-detail@test.local', 'respondent', 'Rewarded Detail');
      INSERT INTO surveys (id, surveyor_id, title, status, target_count, completed_count, published_at)
      VALUES ('${rewardedSurveyId}', '${SURVEYOR_ID}', 'Rewarded Detail Survey', 'published', 10, 1, NOW());
      INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at)
      VALUES ('${rewardedSurveyId}', '${rewardedRespondentId}', 'rewarded', NOW());
    `);

    const detail = await service.getPublicSurvey(rewardedSurveyId, rewardedRespondentId);
    expect(detail.alreadySubmitted).toBe(true);
  });

  it('atomically reserves the last quota slot when two respondents submit together', async () => {
    const quotaSurveyId = '33333333-3333-3333-3333-333333333336';
    const quotaQuestionId = '44444444-4444-4444-4444-444444444446';
    const firstRespondentId = '11111111-1111-1111-1111-111111111113';
    const secondRespondentId = '11111111-1111-1111-1111-111111111114';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES
        ('${firstRespondentId}', 'quota1@test.local', 'respondent', 'Quota 1'),
        ('${secondRespondentId}', 'quota2@test.local', 'respondent', 'Quota 2');
      INSERT INTO respondent_profiles (user_id)
      VALUES ('${firstRespondentId}'), ('${secondRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${quotaSurveyId}', '${SURVEYOR_ID}', 'Quota Survey', 'published', 0, 1, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${quotaQuestionId}', '${quotaSurveyId}', 'text', 'Quota question', 0, true);
    `);

    const submissions = await Promise.allSettled([
      service.submitResponse(quotaSurveyId, firstRespondentId, {
        answers: [{ questionId: quotaQuestionId, textAnswer: 'ok' }],
      }),
      service.submitResponse(quotaSurveyId, secondRespondentId, {
        answers: [{ questionId: quotaQuestionId, textAnswer: 'ok' }],
      }),
    ]);
    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, quotaSurveyId));
    const responses = await db
      .select()
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.surveyId, quotaSurveyId));

    expect(submissions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(submissions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(survey.completedCount).toBe(1);
    expect(survey.status).toBe('closed');
    expect(responses).toHaveLength(1);
  });

  it('releases a lottery quota slot when quality audit downgrades the response', async () => {
    const lotterySurveyId = '33333333-3333-3333-3333-333333333337';
    const lotteryQuestionId = '44444444-4444-4444-4444-444444444447';
    const lotteryRespondentId = '11111111-1111-1111-1111-111111111115';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${lotteryRespondentId}', 'lottery-audit@test.local', 'respondent', 'Lottery Audit');
      INSERT INTO respondent_profiles (user_id) VALUES ('${lotteryRespondentId}');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, lottery_prize,
        lottery_winner_count, lottery_draw_mode, reward_points, target_count,
        completed_count, published_at, lottery_terms_accepted_at
      )
      VALUES (
        '${lotterySurveyId}', '${SURVEYOR_ID}', 'Lottery Audit Survey', 'published',
        'lottery', '餐券', 1, 'when_full', 0, 1, 0, NOW(), NOW()
      );
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${lotteryQuestionId}', '${lotterySurveyId}', 'text', 'Lottery audit question', 0, true);
    `);

    await service.submitResponse(lotterySurveyId, lotteryRespondentId, {
      answers: [{ questionId: lotteryQuestionId, textAnswer: 'ok' }],
    });

    await vi.waitFor(async () => {
      const [survey] = await db
        .select()
        .from(schema.surveys)
        .where(eq(schema.surveys.id, lotterySurveyId));
      expect(survey.completedCount).toBe(0);
      expect(survey.status).toBe('published');
    });
    const [response] = await db
      .select()
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.surveyId, lotterySurveyId));
    expect(response.status).toBe('pending_review');
  });

  it('releases a fixed-reward quota slot and does not pay before quality audit passes', async () => {
    const fixedSurveyId = '33333333-3333-3333-3333-333333333348';
    const fixedQuestionId = '44444444-4444-4444-4444-444444444458';
    const fixedRespondentId = '11111111-1111-1111-1111-111111111128';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${fixedRespondentId}', 'fixed-audit@test.local', 'respondent', 'Fixed Audit');
      INSERT INTO respondent_profiles (user_id) VALUES ('${fixedRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${fixedSurveyId}', '${SURVEYOR_ID}', 'Fixed Audit Survey', 'published', 80, 1, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${fixedQuestionId}', '${fixedSurveyId}', 'text', 'Fixed audit question', 0, true);
    `);
    issueReward.mockClear();
    createNotification.mockClear();
    sendRespondentThankYou.mockClear();

    await service.submitResponse(fixedSurveyId, fixedRespondentId, {
      answers: [{ questionId: fixedQuestionId, textAnswer: 'ok' }],
    });

    await vi.waitFor(async () => {
      const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, fixedSurveyId));
      const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, fixedSurveyId));
      expect(survey.completedCount).toBe(0);
      expect(survey.status).toBe('published');
      expect(response.status).toBe('pending_review');
    });
    expect(issueReward).not.toHaveBeenCalled();
  });

  it('reserves quota and issues rewards when async quality audit promotes a pending response', async () => {
    const passedSurveyId = '33333333-3333-3333-3333-333333333349';
    const passedQuestionId = '44444444-4444-4444-4444-444444444459';
    const passedRespondentId = '11111111-1111-1111-1111-111111111129';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${passedRespondentId}', 'passed-audit@test.local', 'respondent', 'Passed Audit');
      INSERT INTO respondent_profiles (user_id) VALUES ('${passedRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${passedSurveyId}', '${SURVEYOR_ID}', 'Passed Audit Survey', 'published', 25, 1, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${passedQuestionId}', '${passedSurveyId}', 'text', 'Passed audit question', 0, true);
    `);
    const qualityAudit = (service as unknown as { qualityAudit: QualityAuditService }).qualityAudit;
    const originalAudit = qualityAudit.audit.bind(qualityAudit);
    issueReward.mockClear();
    qualityAudit.audit = vi.fn(async () => ({
      behaviorScore: 95,
      signalScores: {
        timing: 95,
        attentionCheck: null,
        reverseConsistency: null,
        textQuality: 95,
        choicePattern: 95,
      },
      llmScore: null,
      llmReasoning: null,
      llmEvidence: [],
      finalScore: 95,
      status: 'passed' as const,
      flags: [],
    }));

    try {
      const result = await service.submitResponse(passedSurveyId, passedRespondentId, {
        answers: [{ questionId: passedQuestionId, textAnswer: 'this answer must pass the async review' }],
      });
      expect(result.flagged).toBe(true);

      await vi.waitFor(async () => {
        const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, passedSurveyId));
        const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, passedSurveyId));
        expect(survey.completedCount).toBe(1);
        expect(survey.status).toBe('closed');
        expect(response.status).toBe('submitted');
        expect(issueReward).toHaveBeenCalledWith(expect.objectContaining({
          surveyId: passedSurveyId,
          respondentId: passedRespondentId,
          rewardAmount: 25,
        }));
      });
    } finally {
      qualityAudit.audit = originalAudit;
    }
  });

  it('allows only one manual approval to restore quota and rewards for a pending response', async () => {
    const manualSurveyId = '33333333-3333-3333-3333-333333333351';
    const manualQuestionId = '44444444-4444-4444-4444-444444444461';
    const manualRespondentId = '11111111-1111-1111-1111-111111111131';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${manualRespondentId}', 'manual-approval@test.local', 'respondent', 'Manual Approval');
      INSERT INTO respondent_profiles (user_id) VALUES ('${manualRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${manualSurveyId}', '${SURVEYOR_ID}', 'Manual Approval Survey', 'published', 45, 1, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${manualQuestionId}', '${manualSurveyId}', 'text', 'Manual approval question', 0, true);
    `);
    issueReward.mockClear();

    await service.submitResponse(manualSurveyId, manualRespondentId, {
      answers: [{ questionId: manualQuestionId, textAnswer: 'ok' }],
    });
    await vi.waitFor(async () => {
      const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, manualSurveyId));
      expect(response.status).toBe('pending_review');
    });

    const [pending] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, manualSurveyId));
    const attempts = await Promise.allSettled([
      service.approvePendingResponse(pending.id),
      service.approvePendingResponse(pending.id),
    ]);
    const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, manualSurveyId));
    const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, manualSurveyId));
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(survey.completedCount).toBe(1);
    expect(survey.status).toBe('closed');
    expect(response.status).toBe('submitted');
    expect(issueReward).toHaveBeenCalledTimes(1);
  });

  it('allows manual approval to restore lottery eligibility after an early close', async () => {
    const closedSurveyId = '33333333-3333-3333-3333-333333333352';
    const closedRespondentId = '11111111-1111-1111-1111-111111111132';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${closedRespondentId}', 'closed-lottery-approval@test.local', 'respondent', 'Closed Lottery Approval');
      INSERT INTO respondent_profiles (user_id) VALUES ('${closedRespondentId}');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, lottery_prize,
        lottery_winner_count, lottery_draw_mode, target_count, completed_count,
        lottery_terms_accepted_at
      )
      VALUES (
        '${closedSurveyId}', '${SURVEYOR_ID}', 'Closed Lottery Approval Survey', 'closed',
        'lottery', '餐券', 1, 'manual', 2, 1, NOW()
      );
      INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at)
      VALUES ('${closedSurveyId}', '${closedRespondentId}', 'pending_review', NOW());
    `);
    const [pending] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, closedSurveyId));

    await service.approvePendingResponse(pending.id);

    const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, closedSurveyId));
    const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.id, pending.id));
    expect(survey.completedCount).toBe(2);
    expect(survey.status).toBe('closed');
    expect(response.status).toBe('submitted');
  });

  it('does not approve a pending lottery response after the draw is sealed', async () => {
    const drawnSurveyId = '33333333-3333-3333-3333-333333333354';
    const drawnRespondentId = '11111111-1111-1111-1111-111111111134';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${drawnRespondentId}', 'drawn-lottery-approval@test.local', 'respondent', 'Drawn Lottery Approval');
      INSERT INTO respondent_profiles (user_id) VALUES ('${drawnRespondentId}');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, lottery_prize,
        lottery_winner_count, lottery_draw_mode, target_count, completed_count,
        lottery_terms_accepted_at, lottery_drawn_at
      )
      VALUES (
        '${drawnSurveyId}', '${SURVEYOR_ID}', 'Drawn Lottery Approval Survey', 'closed',
        'lottery', '餐券', 1, 'manual', 2, 1, NOW(), NOW()
      );
      INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at)
      VALUES ('${drawnSurveyId}', '${drawnRespondentId}', 'pending_review', NOW());
    `);
    const [pending] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.surveyId, drawnSurveyId));

    await expect(service.approvePendingResponse(pending.id))
      .rejects.toThrow('抽獎已完成，無法再補入參與名單');

    const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, drawnSurveyId));
    const [response] = await db.select().from(schema.surveyResponses).where(eq(schema.surveyResponses.id, pending.id));
    expect(survey.completedCount).toBe(1);
    expect(response.status).toBe('pending_review');
  });

  it('retries a stuck quality audit without repeating accepted-response side effects', async () => {
    const retrySurveyId = '33333333-3333-3333-3333-333333333353';
    const retryRespondentId = '11111111-1111-1111-1111-111111111133';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${retryRespondentId}', 'quality-retry@test.local', 'respondent', 'Quality Retry');
      INSERT INTO respondent_profiles (user_id) VALUES ('${retryRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${retrySurveyId}', '${SURVEYOR_ID}', 'Quality Retry Survey', 'published', 35, 10, 1, NOW());
      INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at)
      VALUES ('${retrySurveyId}', '${retryRespondentId}', 'submitted', NOW());
    `);
    const qualityAudit = (service as unknown as { qualityAudit: QualityAuditService }).qualityAudit;
    const originalAudit = qualityAudit.audit.bind(qualityAudit);
    issueReward.mockClear();
    qualityAudit.audit = vi.fn(async () => ({
      behaviorScore: 95,
      signalScores: {
        timing: 95,
        attentionCheck: null,
        reverseConsistency: null,
        textQuality: 95,
        choicePattern: 95,
      },
      llmScore: null,
      llmReasoning: null,
      llmEvidence: [],
      finalScore: 95,
      status: 'passed' as const,
      flags: [],
    }));

    try {
      const [response] = await db
        .select()
        .from(schema.surveyResponses)
        .where(eq(schema.surveyResponses.surveyId, retrySurveyId));
      await service.retryQualityAudit(response.id);
      await service.retryQualityAudit(response.id);

      expect(issueReward).toHaveBeenCalledTimes(1);
      const [profile] = await db
        .select()
        .from(schema.respondentProfiles)
        .where(eq(schema.respondentProfiles.userId, retryRespondentId));
      expect(profile.totalCompleted).toBe(1);
    } finally {
      qualityAudit.audit = originalAudit;
    }
  });

  it('does not issue fixed cash rewards when a lottery response is re-audited', async () => {
    const retrySurveyId = '33333333-3333-3333-3333-333333333355';
    const retryRespondentId = '11111111-1111-1111-1111-111111111135';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${retryRespondentId}', 'lottery-quality-retry@test.local', 'respondent', 'Lottery Quality Retry');
      INSERT INTO respondent_profiles (user_id) VALUES ('${retryRespondentId}');
      INSERT INTO surveys (
        id, surveyor_id, title, status, reward_mode, reward_points, lottery_prize,
        lottery_winner_count, lottery_draw_mode, target_count, completed_count,
        published_at, lottery_terms_accepted_at
      )
      VALUES (
        '${retrySurveyId}', '${SURVEYOR_ID}', 'Lottery Quality Retry Survey', 'published',
        'lottery', 999, '餐券', 1, 'manual', 10, 1, NOW(), NOW()
      );
      INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at)
      VALUES ('${retrySurveyId}', '${retryRespondentId}', 'submitted', NOW());
    `);
    const qualityAudit = (service as unknown as { qualityAudit: QualityAuditService }).qualityAudit;
    const originalAudit = qualityAudit.audit.bind(qualityAudit);
    issueReward.mockClear();
    qualityAudit.audit = vi.fn(async () => ({
      behaviorScore: 95,
      signalScores: {
        timing: 95,
        attentionCheck: null,
        reverseConsistency: null,
        textQuality: 95,
        choicePattern: 95,
      },
      llmScore: null,
      llmReasoning: null,
      llmEvidence: [],
      finalScore: 95,
      status: 'passed' as const,
      flags: [],
    }));

    try {
      const [response] = await db
        .select()
        .from(schema.surveyResponses)
        .where(eq(schema.surveyResponses.surveyId, retrySurveyId));
      await service.retryQualityAudit(response.id);

      expect(issueReward).not.toHaveBeenCalled();
      const thankYouCalls = sendRespondentThankYou.mock.calls as unknown as Array<[string, string, number]>;
      expect(thankYouCalls.some(([respondentId]) => respondentId === retryRespondentId)).toBe(false);
      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: retryRespondentId,
        title: '抽獎資格已確認',
        metadata: expect.objectContaining({ lottery: true, responseId: response.id }),
      }));
    } finally {
      qualityAudit.audit = originalAudit;
    }
  });

  it('accepts zero on a zero-based rating scale and rejects values above the configured maximum', async () => {
    const zeroRespondentId = '11111111-1111-1111-1111-111111111116';
    const invalidRespondentId = '11111111-1111-1111-1111-111111111117';
    const ratingSurveyId = '33333333-3333-3333-3333-333333333338';
    const ratingQuestionId = '44444444-4444-4444-4444-444444444448';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${zeroRespondentId}', 'rating-zero@test.local', 'respondent', 'Rating Zero'),
        ('${invalidRespondentId}', 'rating-invalid@test.local', 'respondent', 'Rating Invalid');
      INSERT INTO respondent_profiles (user_id) VALUES
        ('${zeroRespondentId}'),
        ('${invalidRespondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${ratingSurveyId}', '${SURVEYOR_ID}', 'Rating Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required, config)
      VALUES ('${ratingQuestionId}', '${ratingSurveyId}', 'rating', 'Rating question', 0, true, '{"scaleStart": 0, "maxRating": 5}');
    `);

    await service.submitResponse(ratingSurveyId, zeroRespondentId, {
      answers: [{ questionId: ratingQuestionId, ratingValue: 0 }],
    });
    await expect(service.submitResponse(ratingSurveyId, invalidRespondentId, {
      answers: [{ questionId: ratingQuestionId, ratingValue: 6 }],
    })).rejects.toThrow('評分答案必須介於 0 至 5 之間');

    const answers = await db
      .select({ ratingValue: schema.responseAnswers.ratingValue })
      .from(schema.responseAnswers)
      .where(eq(schema.responseAnswers.surveyId, ratingSurveyId));
    expect(answers).toEqual([{ ratingValue: 0 }]);

    await db
      .update(schema.surveyResponses)
      .set({ status: 'submitted' })
      .where(eq(schema.surveyResponses.surveyId, ratingSurveyId));
    const stats = await service.getSurveyStats(ratingSurveyId, SURVEYOR_ID);
    expect(stats.questionStats[0]).toMatchObject({
      averageRating: 0,
      ratingMin: 0,
      ratingMax: 5,
      ratingBuckets: [
        { value: 0, count: 1 },
        { value: 1, count: 0 },
        { value: 2, count: 0 },
        { value: 3, count: 0 },
        { value: 4, count: 0 },
        { value: 5, count: 0 },
      ],
    });
  });

  it('rejects duplicate question answers before writing analytics data', async () => {
    const respondentId = '11111111-1111-1111-1111-111111111118';
    const surveyId = '33333333-3333-3333-3333-333333333339';
    const questionId = '44444444-4444-4444-4444-444444444449';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${respondentId}', 'duplicate-answer@test.local', 'respondent', 'Duplicate Answer');
      INSERT INTO respondent_profiles (user_id) VALUES ('${respondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${surveyId}', '${SURVEYOR_ID}', 'Duplicate Answer Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${questionId}', '${surveyId}', 'rating', 'Rating question', 0, true);
    `);

    await expect(service.submitResponse(surveyId, respondentId, {
      answers: [
        { questionId, ratingValue: 3 },
        { questionId, ratingValue: 4 },
      ],
    })).rejects.toThrow('同一題目只能提交一份答案');
  });

  it('rejects missing required answers even when the survey has no skip logic', async () => {
    const respondentId = '11111111-1111-1111-1111-111111111119';
    const surveyId = '33333333-3333-3333-3333-333333333340';
    const requiredQuestionId = '44444444-4444-4444-4444-444444444450';
    const optionalQuestionId = '44444444-4444-4444-4444-444444444451';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${respondentId}', 'required-answer@test.local', 'respondent', 'Required Answer');
      INSERT INTO respondent_profiles (user_id) VALUES ('${respondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${surveyId}', '${SURVEYOR_ID}', 'Required Answer Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required) VALUES
        ('${requiredQuestionId}', '${surveyId}', 'text', 'Required question', 0, true),
        ('${optionalQuestionId}', '${surveyId}', 'text', 'Optional question', 1, false);
    `);

    await expect(service.submitResponse(surveyId, respondentId, {
      answers: [{ questionId: optionalQuestionId, textAnswer: 'optional only' }],
    })).rejects.toThrow('尚有必填題目未作答');
  });

  it('rejects option ids that belong to another question', async () => {
    const respondentId = '11111111-1111-1111-1111-111111111120';
    const surveyId = '33333333-3333-3333-3333-333333333341';
    const questionId = '44444444-4444-4444-4444-444444444452';
    const otherQuestionId = '44444444-4444-4444-4444-444444444453';
    const optionId = '55555555-5555-5555-8555-555555555550';
    const otherOptionId = '55555555-5555-5555-8555-555555555551';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${respondentId}', 'foreign-option@test.local', 'respondent', 'Foreign Option');
      INSERT INTO respondent_profiles (user_id) VALUES ('${respondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${surveyId}', '${SURVEYOR_ID}', 'Foreign Option Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required) VALUES
        ('${questionId}', '${surveyId}', 'single_choice', 'Question A', 0, true),
        ('${otherQuestionId}', '${surveyId}', 'single_choice', 'Question B', 1, false);
      INSERT INTO question_options (id, question_id, label, sort_order) VALUES
        ('${optionId}', '${questionId}', 'A1', 0),
        ('${otherOptionId}', '${otherQuestionId}', 'B1', 0);
    `);

    await expect(service.submitResponse(surveyId, respondentId, {
      answers: [{ questionId, selectedOptionIds: [otherOptionId] }],
    })).rejects.toThrow('選項答案不屬於對應題目');
  });

  it('ignores empty hidden answers while enforcing show rules', async () => {
    const respondentId = '11111111-1111-1111-1111-111111111121';
    const surveyId = '33333333-3333-3333-3333-333333333342';
    const triggerQuestionId = '44444444-4444-4444-4444-444444444454';
    const hiddenQuestionId = '44444444-4444-4444-4444-444444444455';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${respondentId}', 'hidden-empty@test.local', 'respondent', 'Hidden Empty');
      INSERT INTO respondent_profiles (user_id) VALUES ('${respondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${surveyId}', '${SURVEYOR_ID}', 'Hidden Empty Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required) VALUES
        ('${triggerQuestionId}', '${surveyId}', 'text', 'Trigger question', 0, true),
        ('${hiddenQuestionId}', '${surveyId}', 'text', 'Hidden question', 1, true);
      INSERT INTO survey_logic_rules (survey_id, trigger_question_id, condition, value, action, target_question_id, sort_order)
      VALUES ('${surveyId}', '${triggerQuestionId}', 'eq', 'show details', 'show', '${hiddenQuestionId}', 0);
    `);

    await expect(service.submitResponse(surveyId, respondentId, {
      answers: [
        { questionId: triggerQuestionId, textAnswer: 'skip' },
        { questionId: hiddenQuestionId },
      ],
    })).resolves.toMatchObject({ flagged: false });
    await vi.waitFor(async () => {
      const [response] = await db
        .select({ status: schema.surveyResponses.status })
        .from(schema.surveyResponses)
        .where(eq(schema.surveyResponses.surveyId, surveyId));
      expect(response.status).toBe('pending_review');
    });
    await db
      .update(schema.surveyResponses)
      .set({ status: 'submitted' })
      .where(eq(schema.surveyResponses.surveyId, surveyId));

    const stats = await service.getSurveyStats(surveyId, SURVEYOR_ID);
    expect(stats.questionStats).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: triggerQuestionId, totalAnswers: 1 }),
      expect.objectContaining({ questionId: hiddenQuestionId, totalAnswers: 0 }),
    ]));
  });

  it('accepts yes-no synthetic options and exposes their statistics', async () => {
    const respondentId = '11111111-1111-1111-1111-111111111122';
    const surveyId = '33333333-3333-3333-3333-333333333343';
    const questionId = '44444444-4444-4444-4444-444444444456';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${respondentId}', 'yes-no@test.local', 'respondent', 'Yes No');
      INSERT INTO respondent_profiles (user_id) VALUES ('${respondentId}');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${surveyId}', '${SURVEYOR_ID}', 'Yes No Survey', 'published', 0, 10, 0, NOW());
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required, config)
      VALUES ('${questionId}', '${surveyId}', 'single_choice', 'Yes or no?', 0, true, '{"variant": "yes_no"}');
    `);

    await service.submitResponse(surveyId, respondentId, {
      answers: [{ questionId, selectedOptionIds: ['yes'] }],
    });
    await vi.waitFor(async () => {
      const [response] = await db
        .select({ status: schema.surveyResponses.status })
        .from(schema.surveyResponses)
        .where(eq(schema.surveyResponses.surveyId, surveyId));
      expect(response.status).toBe('pending_review');
    });
    await db
      .update(schema.surveyResponses)
      .set({ status: 'submitted' })
      .where(eq(schema.surveyResponses.surveyId, surveyId));

    const stats = await service.getSurveyStats(surveyId, SURVEYOR_ID);
    expect(stats.questionStats[0]).toMatchObject({
      optionCounts: [
        { optionId: 'yes', label: '是', count: 1 },
        { optionId: 'no', label: '否', count: 0 },
      ],
    });
  });
});

describe('ResponsesService.submitResponse 防刷頻率限制 + 機器人封禁', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ResponsesService;

  const RID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const SID_OWNER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  function makeService(antiCheatScore: number) {
    const antiCheat = { evaluate: () => ({ score: antiCheatScore, flags: [] }) } as unknown as AntiCheatService;
    const wallet = { issueReward: vi.fn(async () => undefined) } as unknown as WalletService;
    const notifications = { create: vi.fn(async () => undefined), sendRespondentThankYou: vi.fn(async () => undefined) } as unknown as NotificationsService;
    const qualityAudit = { audit: async () => ({ finalScore: 90, status: 'passed', flags: [], signalScores: {}, llmScore: null, llmReasoning: null, llmEvidence: [], behaviorScore: 90 }) } as unknown as QualityAuditService;
    const reputation = { adjust: async () => undefined } as unknown as ReputationService;
    const spin = { grantChance: async () => undefined } as unknown as SpinService;
    const coupons = { issueForResponse: vi.fn(async () => undefined) } as unknown as CouponsService;
    return new ResponsesService(db as unknown as AppDb, antiCheat, wallet, coupons, notifications, qualityAudit, reputation, spin, new CryptoService());
  }

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${RID}', 'farm@test.local', 'respondent', 'Farmer'),
        ('${SID_OWNER}', 'owner2@test.local', 'surveyor', 'Owner');
      INSERT INTO respondent_profiles (user_id) VALUES ('${RID}');
    `);
    // 建 14 份已上架問卷（各 1 題），id 用序號
    for (let i = 0; i < 14; i++) {
      const sid = `cccccccc-cccc-cccc-cccc-0000000000${String(i).padStart(2, '0')}`;
      const qid = `dddddddd-dddd-dddd-dddd-0000000000${String(i).padStart(2, '0')}`;
      await client.exec(`
        INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
        VALUES ('${sid}', '${SID_OWNER}', 'S${i}', 'published', 10, 100, 0, NOW());
        INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
        VALUES ('${qid}', '${sid}', 'text', 'Q', 0, true);
      `);
    }
    db = drizzle(client, { schema });
  });

  afterAll(async () => { await client?.close(); });

  it('超過每小時上限（12 份）→ 第 13 份被擋下', async () => {
    service = makeService(10);
    // 直接塞 12 筆「最近一小時內」的已提交回答（surveys 0-11）
    for (let i = 0; i < 12; i++) {
      const sid = `cccccccc-cccc-cccc-cccc-0000000000${String(i).padStart(2, '0')}`;
      await client.exec(`INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at) VALUES ('${sid}', '${RID}', 'submitted', NOW());`);
    }
    // 第 13 份（survey 12）→ 應觸發每小時上限
    const sid12 = 'cccccccc-cccc-cccc-cccc-000000000012';
    await expect(
      service.submitResponse(sid12, RID, { answers: [{ questionId: 'dddddddd-dddd-dddd-dddd-000000000012', selectedOptionIds: ['x'] }] }),
    ).rejects.toThrow(/本小時填答已達上限/);
  });

  it('短時間多筆極快填答（anti-cheat>=50）→ 機器人封禁，擋下提交', async () => {
    // 清掉上一測試的回答，改塞 2 筆「最近 30 分鐘、anti_cheat_score>=50」
    await client.exec(`DELETE FROM survey_responses WHERE respondent_id='${RID}';`);
    await client.exec(`UPDATE respondent_profiles SET suspended_until=NULL WHERE user_id='${RID}';`);
    for (let i = 0; i < 2; i++) {
      const sid = `cccccccc-cccc-cccc-cccc-0000000000${String(i).padStart(2, '0')}`;
      await client.exec(`INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at, anti_cheat_score) VALUES ('${sid}', '${RID}', 'rejected', NOW(), 60);`);
    }
    // 本次也極快（score 60）→ 第 3 筆觸發封禁
    service = makeService(60);
    const sid13 = 'cccccccc-cccc-cccc-cccc-000000000013';
    await expect(
      service.submitResponse(sid13, RID, { answers: [{ questionId: 'dddddddd-dddd-dddd-dddd-000000000013', textAnswer: '這是一段足夠長的回答內容用於測試' }] }),
    ).rejects.toThrow(/自動化|機器人|暫停/);
    // 確認已寫入 suspended_until
    const prof = await db.select().from(schema.respondentProfiles).where(eq(schema.respondentProfiles.userId, RID));
    expect(prof[0].suspendedUntil).toBeTruthy();
  });
});
