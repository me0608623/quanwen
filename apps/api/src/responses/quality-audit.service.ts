import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  surveys,
  surveyResponses,
  surveyQuestions,
  questionOptions,
  responseAnswers,
  respondentProfiles,
} from '../db/schema';
import { ZaiClient } from '../ai-audit/zai.client';
import { parseHolisticJudge } from '../ai-audit/schemas';
import { HOLISTIC_JUDGE, resolvePrompt } from '../ai-audit/prompts';
import { CryptoService } from '../common/crypto.service';
import { AntiCheatService } from './anti-cheat.service';
import type { AnswerDto } from './dto/submit-response.dto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BehaviorMetrics {
  fillDurationSeconds: number | null;
  windowSwitchCount?: number;     // Phase 2 會從前端送來
  pasteEventCount?: number;
  totalKeystrokes?: number;
  perQuestionTimes?: Record<string, number>; // questionId → seconds
}

export interface QualityBreakdown {
  // Layer 2: 行為加權分（0-100）
  behaviorScore: number;
  signalScores: {
    timing: number;
    attentionCheck: number | null;   // 沒設 check 題就 null
    reverseConsistency: number | null;
    textQuality: number;
    choicePattern: number;
  };

  // Layer 3: LLM 分數（只在灰色地帶才有）
  llmScore: number | null;
  llmReasoning: string | null;
  llmEvidence: string[];

  // 最終結果
  finalScore: number;          // 0-100
  status: 'passed' | 'suspicious' | 'rejected';
  flags: string[];
}

// 權重（來自 03-核心功能/品質審核機制.md）
const WEIGHTS = {
  behavior: 0.25,
  attention: 0.20,
  reverse: 0.15,
  relevance: 0.15,
  aiDetect: 0.10,
  reputation: 0.10,
  timing: 0.05,
};

/**
 * 三段裁決 + 動態容錯救回（純函式，可單測）。
 *
 * 基本規則：<50 rejected、50-79 suspicious、>=80 passed；LLM 建議可往嚴格方向覆寫。
 * 救回規則：避免「分數略低但開放題回答具實質價值」被二分法直接判死 —
 * 40-49 邊緣分 + 文字品質訊號高（>=70）+ LLM 沒有明確建議拒絕
 * → 降級為 suspicious（不發獎、進人工/申訴流程），而非直接 rejected。
 */
export function resolveQualityVerdict(
  finalScore: number,
  llmRecommendation: 'approve' | 'manual_review' | 'reject' | null,
  signalScores: { textQuality: number },
): { status: 'passed' | 'suspicious' | 'rejected'; rescueFlag: string | null } {
  let status: 'passed' | 'suspicious' | 'rejected';
  if (llmRecommendation === 'reject' || finalScore < 50) {
    status = 'rejected';
  } else if (llmRecommendation === 'manual_review' || finalScore < 80) {
    status = 'suspicious';
  } else {
    status = 'passed';
  }

  if (
    status === 'rejected' &&
    llmRecommendation !== 'reject' &&
    finalScore >= 40 &&
    signalScores.textQuality >= 70
  ) {
    return {
      status: 'suspicious',
      rescueFlag: '邊緣分數但開放題回答具實質內容，轉人工複核（未直接判定無效）',
    };
  }

  return { status, rescueFlag: null };
}

export function calculateReversePairConsistency(
  pairs: Array<{ a: number; b: number; minRating: number; maxRating: number }>,
): number | null {
  if (pairs.length === 0) return null;

  const avgDeviation = pairs.reduce((sum, pair) => {
    const expected = pair.minRating + pair.maxRating;
    const deviation = Math.abs(pair.a + pair.b - expected);
    return sum + deviation / Math.max(1, pair.maxRating - pair.minRating);
  }, 0) / pairs.length;

  return Math.round(Math.max(0, 1 - avgDeviation) * 100);
}

@Injectable()
export class QualityAuditService {
  private readonly logger = new Logger(QualityAuditService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
    private readonly antiCheat: AntiCheatService,
    private readonly cryptoSvc: CryptoService,
  ) {}

  /**
   * 完整 3 層品質審核 pipeline
   * @param responseId 已存的 response 紀錄 ID
   * @param behavior 從前端送來的行為訊號（Phase 2 才會完整）
   * @param options.force 為 true 時忽略 DB 已存的 quality_breakdown，重新跑全 pipeline
   */
  async audit(
    responseId: string,
    behavior: BehaviorMetrics,
    options: { force?: boolean } = {},
  ): Promise<QualityBreakdown> {
    // ── 載入資料 ─────────────────────────────────────────────────────────
    const data = await this.loadResponseContext(responseId);
    if (!data) {
      this.logger.warn(`audit: response ${responseId} not found`);
      return this.defaultBreakdown();
    }
    const { response, survey, questions, answers, options: questionOpts, respondentProfile } = data;

    // ── Phase II.8: DB 短路 — 若已 audit 過且 force≠true，直接回 cached ────────
    if (!options.force && response.qualityScore !== null && response.qualityBreakdown) {
      const cached = response.qualityBreakdown as Partial<QualityBreakdown>;
      // sanity check：必填欄位都存在才信任 cache
      if (
        cached.finalScore !== undefined &&
        cached.status !== undefined &&
        cached.behaviorScore !== undefined
      ) {
        this.logger.log(
          `audit DB_HIT response=${responseId} finalScore=${cached.finalScore} status=${cached.status}`,
        );
        return cached as QualityBreakdown;
      }
      // cache 不完整 → fall through 重跑（log 為觀察用）
      this.logger.warn(
        `audit DB cache incomplete for ${responseId}, recomputing. cached=${JSON.stringify(cached).slice(0, 200)}`,
      );
    }

    // ── Layer 1+2：規則式行為訊號評分 ────────────────────────────────────
    const legacy = this.antiCheat.evaluate(
      answers as unknown as AnswerDto[],
      questions.length,
      behavior.fillDurationSeconds,
    );

    const signalScores = this.computeSignalScores({
      behavior,
      legacy,
      questions,
      answers,
      options: questionOpts,
    });
    const behaviorScore = this.weightedBehavior(signalScores);

    // ── Layer 3：LLM 評分（灰色地帶才呼叫，省 token）──────────────────────
    let llmScore: number | null = null;
    let llmReasoning: string | null = null;
    let llmEvidence: string[] = [];
    let llmRecommendation: 'approve' | 'manual_review' | 'reject' | null = null;

    if (behaviorScore >= 40 && behaviorScore < 75) {
      try {
        const llm = await this.callHolisticJudge({
          survey,
          questions,
          answers,
          behavior,
          behaviorScore,
          respondentProfile,
        });
        llmScore = llm.sincerity_score;
        llmReasoning = llm.summary ?? llm.primary_concern ?? '';
        llmEvidence = llm.evidence ?? [];
        llmRecommendation = llm.recommendation ?? null;
      } catch (err) {
        this.logger.error(`Holistic-judge LLM failed for ${responseId}`, err);
      }
    }

    // ── 最終分數 & 三段裁決 ──────────────────────────────────────────────
    // 有 LLM 分數時：取行為分與 LLM 分的加權平均（LLM 看到更多 context，權重 0.6）
    const finalScore = llmScore !== null
      ? Math.round(behaviorScore * 0.4 + llmScore * 0.6)
      : Math.round(behaviorScore);

    const { status, rescueFlag } = resolveQualityVerdict(finalScore, llmRecommendation, signalScores);
    const flags = rescueFlag ? [...legacy.flags, rescueFlag] : [...legacy.flags];

    return {
      behaviorScore,
      signalScores,
      llmScore,
      llmReasoning,
      llmEvidence,
      finalScore,
      status,
      flags,
    };
  }

  // ─── Loader ──────────────────────────────────────────────────────────────

  private async loadResponseContext(responseId: string) {
    const respRows = await this.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    const response = respRows[0];
    if (!response) return null;

    const surveyRows = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, response.surveyId))
      .limit(1);
    const survey = surveyRows[0];
    if (!survey) return null;

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, survey.id))
      .orderBy(surveyQuestions.sortOrder);

    const answers = await this.db
      .select()
      .from(responseAnswers)
      .where(eq(responseAnswers.responseId, responseId));

    // Phase 5: 載入 question options 用於 attention check label 比對
    const questionIds = questions.map((q) => q.id);
    const options = questionIds.length > 0
      ? await this.db
          .select()
          .from(questionOptions)
          .where(
            questionIds.length === 1
              ? eq(questionOptions.questionId, questionIds[0])
              : inArray(questionOptions.questionId, questionIds),
          )
      : [];

    const profileRows = await this.db
      .select()
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, response.respondentId))
      .limit(1);
    const respondentProfile = profileRows[0];

    return { response, survey, questions, answers, options, respondentProfile };
  }

  // ─── 行為訊號計算 ────────────────────────────────────────────────────────

  private computeSignalScores(input: {
    behavior: BehaviorMetrics;
    legacy: { score: number; flags: string[] };
    questions: Array<{ id: string; type: string; title: string; config: unknown }>;
    answers: Array<{ questionId: string; textAnswer: string | null; ratingValue: number | null; selectedOptionIds: unknown }>;
    options: Array<{ id: string; questionId: string; label: string }>;
  }) {
    const { behavior, legacy, questions, answers, options } = input;

    // ── 完整度懲罰：實際作答 / 應作答 ──
    const expectedAnswers = questions.length;
    const actualAnswers = answers.filter((a) =>
      (a.textAnswer && a.textAnswer.trim().length > 0) ||
      a.ratingValue !== null ||
      (Array.isArray(a.selectedOptionIds) && (a.selectedOptionIds as unknown[]).length > 0),
    ).length;
    const completionRatio = expectedAnswers > 0 ? actualAnswers / expectedAnswers : 0;
    // 完整度低於 50% → 額外扣 choicePattern 與 textQuality
    const completionPenalty = completionRatio < 0.5 ? 50 : completionRatio < 0.8 ? 20 : 0;

    // 把 legacy anti-cheat 分數反過來變正面分（越低越好）
    let choicePattern = Math.max(0, 100 - legacy.score);
    choicePattern = Math.max(0, choicePattern - completionPenalty);

    // Timing：用 fillDuration / question count
    let timing = 50;
    if (behavior.fillDurationSeconds !== null) {
      const expectedMin = questions.length * 3;
      const ratio = behavior.fillDurationSeconds / expectedMin;
      if (ratio < 0.3) timing = 0;
      else if (ratio < 0.5) timing = 40;
      else if (ratio < 2.0) timing = 100;
      else if (ratio < 3.0) timing = 80;
      else timing = 50;
    }

    // Text quality：文字題長度合理
    const textQs = questions.filter((q) => q.type === 'text');
    const textAns = answers.filter((a) => {
      const q = questions.find((qq) => qq.id === a.questionId);
      return q?.type === 'text' && a.textAnswer && a.textAnswer.trim().length > 0;
    });
    let textQuality: number;
    if (textQs.length === 0) {
      // 沒有文字題 → 不打分（中性）
      textQuality = 70;
    } else if (textAns.length === 0) {
      // 有文字題但完全沒答 → 0 分
      textQuality = 0;
    } else {
      const avgLen = textAns.reduce((sum, a) => sum + (a.textAnswer?.trim().length ?? 0), 0) / textAns.length;
      if (avgLen < 5) textQuality = 0;
      else if (avgLen < 15) textQuality = 50;
      else textQuality = 100;
      // 文字題作答率
      const textAnswerRatio = textAns.length / textQs.length;
      textQuality = Math.round(textQuality * textAnswerRatio);
    }

    // ── Phase 5.1: Attention Check 答對率 ─────────────────────────────────
    // 讀題目 config.isAttentionCheck = true 的題，比對受試者答案是否符合 correctValue
    const attentionCheck = this.scoreAttentionChecks(questions, answers, options);

    // ── Phase 5.3: Reverse Pair 一致性 ────────────────────────────────────
    // 量表題若 config.reverseOf 指向另一題，正反加總應接近量尺起點 + 終點。
    const reverseConsistency = this.scoreReversePairs(questions, answers);

    return {
      timing,
      attentionCheck,
      reverseConsistency,
      textQuality,
      choicePattern,
    };
  }

  /** Phase 5.1: 計算注意力檢核題答對率（0-100），無檢核題回傳 null */
  private scoreAttentionChecks(
    questions: Array<{ id: string; type: string; config: unknown }>,
    answers: Array<{ questionId: string; textAnswer: string | null; selectedOptionIds: unknown }>,
    options: Array<{ id: string; questionId: string; label: string }>,
  ): number | null {
    const checks = questions.filter((q) => {
      const cfg = q.config as { isAttentionCheck?: boolean } | null;
      return cfg?.isAttentionCheck === true;
    });
    if (checks.length === 0) return null;

    let correct = 0;
    for (const q of checks) {
      const cfg = q.config as { correctValue?: string } | null;
      const expected = (cfg?.correctValue ?? '').toString().trim().toLowerCase();
      if (!expected) continue;
      const ans = answers.find((a) => a.questionId === q.id);
      if (!ans) continue;

      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        const selectedIds = Array.isArray(ans.selectedOptionIds)
          ? (ans.selectedOptionIds as string[])
          : [];
        const selectedLabels = selectedIds
          .map((id) => options.find((o) => o.id === id)?.label?.trim().toLowerCase() ?? '')
          .filter(Boolean);
        if (selectedLabels.length === 1 && selectedLabels[0] === expected) {
          correct += 1;
        }
      } else if (q.type === 'text') {
        const got = (ans.textAnswer ?? '').trim().toLowerCase();
        if (got === expected) correct += 1;
      }
    }

    return Math.round((correct / checks.length) * 100);
  }

  /** Phase 5.3: 計算反向題一致性（0-100），無反向題回傳 null */
  private scoreReversePairs(
    questions: Array<{ id: string; type: string; config: unknown; sortOrder?: number }>,
    answers: Array<{ questionId: string; ratingValue: number | null }>,
  ): number | null {
    // 只看 rating 題 + 有 reverseOfIndex（sortOrder）或 reverseOf（id）
    const pairs: Array<{ a: number; b: number; minRating: number; maxRating: number }> = [];
    const seen = new Set<string>();

    for (const q of questions) {
      if (q.type !== 'rating') continue;
      const cfg = q.config as { reverseOf?: string; reverseOfIndex?: number; maxRating?: number; scaleStart?: number } | null;
      let partner: typeof q | undefined;
      if (cfg?.reverseOfIndex != null) {
        partner = questions.find((x) => x.sortOrder === cfg.reverseOfIndex && x.type === 'rating');
      } else if (cfg?.reverseOf) {
        partner = questions.find((x) => x.id === cfg.reverseOf && x.type === 'rating');
      }
      if (!partner) continue;
      if (seen.has(q.id) || seen.has(partner.id)) continue;

      const ansA = answers.find((a) => a.questionId === q.id)?.ratingValue;
      const ansB = answers.find((a) => a.questionId === partner.id)?.ratingValue;
      if (ansA == null || ansB == null) continue;

      const partnerCfg = partner.config as { maxRating?: number; scaleStart?: number } | null;
      const maxRating = cfg?.maxRating ?? partnerCfg?.maxRating ?? 5;
      const minRating = (cfg?.scaleStart ?? partnerCfg?.scaleStart) === 0 ? 0 : 1;

      pairs.push({ a: ansA, b: ansB, minRating, maxRating });
      seen.add(q.id);
      seen.add(partner.id);
    }

    return calculateReversePairConsistency(pairs);
  }

  private weightedBehavior(s: QualityBreakdown['signalScores']): number {
    // 動態權重：沒有 attention/reverse 訊號時把權重攤到其他
    let totalWeight = WEIGHTS.behavior + WEIGHTS.timing;
    let weighted = s.choicePattern * WEIGHTS.behavior + s.timing * WEIGHTS.timing;

    if (s.attentionCheck !== null) {
      weighted += s.attentionCheck * WEIGHTS.attention;
      totalWeight += WEIGHTS.attention;
    }
    if (s.reverseConsistency !== null) {
      weighted += s.reverseConsistency * WEIGHTS.reverse;
      totalWeight += WEIGHTS.reverse;
    }
    // textQuality 對應 relevance weight (Phase 1 簡化)
    weighted += s.textQuality * WEIGHTS.relevance;
    totalWeight += WEIGHTS.relevance;

    return Math.round(weighted / totalWeight);
  }

  // ─── Layer 3 LLM：Holistic Judge ────────────────────────────────────────

  private async callHolisticJudge(input: {
    survey: { title: string; description: string | null };
    questions: Array<{ id: string; title: string; type: string }>;
    answers: Array<{ questionId: string; textAnswer: string | null; ratingValue: number | null; selectedOptionIds: unknown }>;
    behavior: BehaviorMetrics;
    behaviorScore: number;
    respondentProfile?: {
      reputationScore: number;
      totalCompleted: number;
    };
  }): Promise<{
    sincerity_score: number;
    primary_concern?: string;
    evidence?: string[];
    recommendation?: 'approve' | 'manual_review' | 'reject';
    summary?: string;
  }> {
    const qaList = input.questions.map((q, i) => {
      const a = input.answers.find((x) => x.questionId === q.id);
      let answerText = '(未答)';
      if (a) {
        if (a.textAnswer) {
          // Phase B.7: 受試者開放題內容送 LLM 前先 redact PII
          answerText = this.cryptoSvc.redactPii(a.textAnswer.slice(0, 200));
        }
        else if (a.ratingValue != null) answerText = `${a.ratingValue}`;
        else if (a.selectedOptionIds && Array.isArray(a.selectedOptionIds)) {
          answerText = (a.selectedOptionIds as string[]).join(', ');
        }
      }
      return `Q${i + 1} (${q.type}): ${q.title}\n  答: ${answerText}`;
    }).join('\n');

    const userPrompt = [
      '=== 受試者資料 ===',
      `信譽分：${input.respondentProfile?.reputationScore ?? 60}`,
      `歷史完成數：${input.respondentProfile?.totalCompleted ?? 0}`,
      '',
      '=== 行為訊號 ===',
      `總填答時長：${input.behavior.fillDurationSeconds ?? 'N/A'} 秒（預估應為 ${input.questions.length * 30} 秒）`,
      `視窗切換次數：${input.behavior.windowSwitchCount ?? '未蒐集'}`,
      `複製貼上次數：${input.behavior.pasteEventCount ?? '未蒐集'}`,
      `行為加權分：${input.behaviorScore} / 100`,
      '',
      `=== 問卷主題 ===`,
      input.survey.title,
      input.survey.description ?? '',
      '',
      '=== 題目與答案 ===',
      qaList,
      '',
      '請以 JSON 格式回覆：',
      '{',
      '  "sincerity_score": 0-100,',
      '  "primary_concern": "若分數 < 70，最主要的疑慮",',
      '  "evidence": ["具體跡象，引用題號"],',
      '  "recommendation": "approve" | "manual_review" | "reject",',
      '  "summary": "1-2 句結論"',
      '}',
    ].join('\n');

    // Phase II.5/II.6: prompt 從 registry 取，env feature flag 可切換版本
    const prompt = resolvePrompt(HOLISTIC_JUDGE);
    const raw = await this.zai.jsonChat<unknown>(
      prompt.system,
      userPrompt,
      {
        temperature: 0.3,
        model: this.zai.auditModel, // 灰區品質裁決：維持高品質模型
        promptKey: prompt.key,
        promptVersion: prompt.version,
      },
    );
    return parseHolisticJudge(raw);
  }

  // ─── Default fallback ──────────────────────────────────────────────────

  private defaultBreakdown(): QualityBreakdown {
    return {
      behaviorScore: 60,
      signalScores: {
        timing: 60, attentionCheck: null, reverseConsistency: null,
        textQuality: 60, choicePattern: 60,
      },
      llmScore: null,
      llmReasoning: null,
      llmEvidence: [],
      finalScore: 60,
      status: 'suspicious',
      flags: [],
    };
  }
}
