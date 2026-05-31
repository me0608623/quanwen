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
import type { NotificationsService } from '../notifications/notifications.service';
import type { QualityAuditService } from './quality-audit.service';
import type { ReputationService } from './reputation.service';
import type { SpinService } from '../spin/spin.service';

const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';
const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const SURVEY_ID = '33333333-3333-3333-3333-333333333333';
const QUESTION_ID = '44444444-4444-4444-4444-444444444444';

describe('ResponsesService.submitResponse pending_review gate', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ResponsesService;
  const issueReward = vi.fn(async () => undefined);

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
    const notifications = { create: async () => undefined } as unknown as NotificationsService;
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
      notifications,
      qualityAudit,
      reputation,
      spin,
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
});


