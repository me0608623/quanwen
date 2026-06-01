/**
 * Phase II.8: quality-audit DB short-circuit 整合測試
 *
 * 若 response.quality_score + quality_breakdown 已存在，audit() 應直接回
 * cached breakdown，不再跑規則式評分或 LLM 呼叫。
 *
 * 這個 test 確保：
 *  1. 已 audit 過的 response → DB_HIT，回 cached
 *  2. force:true → 略過 cache，重跑（不會直接驗最終結果，因為這條 path 會走 LLM；
 *     只驗「cache 沒被信任」這件事 — 透過 spy on ZaiClient 或 antiCheat）
 *  3. cache 不完整（缺欄位）→ fall through 重跑
 *  4. 未 audit 過（quality_score=null）→ 正常跑 pipeline
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';

delete process.env.ZAI_API_KEY; // 確保不會走 LLM
process.env.PII_ENCRYPTION_KEY = 'phase-ii8-test-pii-key';
process.env.PII_KDF_SALT = 'phase-ii8-salt';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { ZaiClient } from '../ai-audit/zai.client';
import { AntiCheatService } from './anti-cheat.service';
import { QualityAuditService } from './quality-audit.service';

const RESPONSE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const RESPONDENT_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const SURVEYOR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddd01';

describe('QualityAuditService DB short-circuit (Phase II.8)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: QualityAuditService;
  let antiCheatCallCount = 0;
  let antiCheat: AntiCheatService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);

    // 一個已 audit 過的 response（quality_score=85, status=passed）
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR_ID}', 'bb@bb.bb', 'surveyor', 'bb'),
        ('${RESPONDENT_ID}', 'aa@aa.aa', 'respondent', 'aa');
      INSERT INTO surveys (id, surveyor_id, title, description) VALUES
        ('${SURVEY_ID}', '${SURVEYOR_ID}', '測試問卷', 'desc');
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order) VALUES
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '${SURVEY_ID}', 'text', '請說明', 1);
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at,
        fill_duration_seconds, quality_score, quality_breakdown) VALUES
        ('${RESPONSE_ID}', '${SURVEY_ID}', '${RESPONDENT_ID}', 'rewarded', NOW(),
          120, 85,
          '{"behaviorScore":80,"signalScores":{"timing":90,"attentionCheck":null,"reverseConsistency":null,"textQuality":75,"choicePattern":80},"llmScore":88,"llmReasoning":"質量不錯","llmEvidence":[],"finalScore":85,"status":"passed","flags":[]}'::jsonb);
      INSERT INTO response_answers (response_id, survey_id, question_id, text_answer) VALUES
        ('${RESPONSE_ID}', '${SURVEY_ID}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '我覺得這份問卷很好');
    `);

    db = drizzle(client, { schema });
    const zai = new ZaiClient(); // 無 key，會 throw 若被呼叫
    const crypto = new CryptoService();
    antiCheat = new AntiCheatService();

    // 用 Proxy 替代 antiCheat 計數，避免直接賦值方法在 TS class instance 上的怪行為
    const realEvaluate = antiCheat.evaluate.bind(antiCheat);
    const counted = new Proxy(antiCheat, {
      get(target, prop, receiver) {
        if (prop === 'evaluate') {
          return (...args: Parameters<typeof realEvaluate>) => {
            antiCheatCallCount++;
            return realEvaluate(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    // ctor order: (db, zai, antiCheat, cryptoSvc) — see quality-audit.service.ts:67
    service = new QualityAuditService(db as never, zai, counted, crypto);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('1. 已 audit 過的 response → DB_HIT，回 cached、antiCheat 沒被呼叫', async () => {
    antiCheatCallCount = 0;
    const result = await service.audit(RESPONSE_ID, { fillDurationSeconds: 120 });

    expect(result.finalScore).toBe(85);
    expect(result.status).toBe('passed');
    expect(result.behaviorScore).toBe(80);
    expect(antiCheatCallCount).toBe(0); // 短路成功的關鍵斷言
  });

  it('2. force:true → 略過 cache，會跑 pipeline（antiCheat 被呼叫）', async () => {
    antiCheatCallCount = 0;
    const result = await service.audit(
      RESPONSE_ID,
      { fillDurationSeconds: 120 },
      { force: true },
    );
    expect(antiCheatCallCount).toBe(1);
    expect(['passed', 'suspicious', 'rejected']).toContain(result.status);
  });

  it('3. cache 不完整（缺 finalScore）→ fall through 重跑', async () => {
    await db
      .update(schema.surveyResponses)
      .set({
        qualityBreakdown: {
          status: 'passed' as const,
          behaviorScore: 80,
          // 缺 finalScore
        } as never,
      })
      .where(eq(schema.surveyResponses.id, RESPONSE_ID));

    antiCheatCallCount = 0;
    const result = await service.audit(RESPONSE_ID, { fillDurationSeconds: 120 });
    expect(antiCheatCallCount).toBe(1);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('4. quality_score=null（未 audit）→ 正常跑 pipeline', async () => {
    const NEW_RESP = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await client.exec(`
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at, fill_duration_seconds) VALUES
        ('${NEW_RESP}', '${SURVEY_ID}', '${SURVEYOR_ID}', 'submitted', NOW(), 60);
      INSERT INTO response_answers (response_id, survey_id, question_id, text_answer) VALUES
        ('${NEW_RESP}', '${SURVEY_ID}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '不錯');
    `);
    antiCheatCallCount = 0;
    const result = await service.audit(NEW_RESP, { fillDurationSeconds: 60 });
    expect(antiCheatCallCount).toBe(1);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });
});
