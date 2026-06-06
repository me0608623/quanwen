import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { eq, and, desc, sql, inArray, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  surveys,
  surveyQuestions,
  questionOptions,
  surveyResponses,
  responseAnswers,
  respondentProfiles,
  respondentTags,
  users,
  surveyLogicRules,
} from '../db/schema';
import type { AnswerDto, BehaviorLogDto, SubmitResponseDto } from './dto/submit-response.dto';
import { AntiCheatService } from './anti-cheat.service';
import { QualityAuditService } from './quality-audit.service';
import { ReputationService } from './reputation.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SpinService } from '../spin/spin.service';
import { redactPii } from '../surveys/analysis/anonymizer';
import { shuffleOptions, generateSeed, type ShuffleOption } from '../surveys/shuffle';
import { SurveyLotteryService } from '../surveys/survey-lottery.service';

@Injectable()
export class ResponsesService {
  private readonly logger = new Logger(ResponsesService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly antiCheat: AntiCheatService,
    private readonly walletService: WalletService,
    private readonly notifications: NotificationsService,
    private readonly qualityAudit: QualityAuditService,
    private readonly reputation: ReputationService,
    private readonly spin: SpinService,
    @Optional() private readonly surveyLottery?: SurveyLotteryService,
  ) {}

  // ─── 受試者：分類別計數（給 task list 的 filter UI 用） ────────────────────

  async getCategoryCounts(respondentId: string): Promise<Record<string, number>> {
    // 單一 SQL 下推：排除已有填答紀錄、過期、已達配額後，依分類計數。
    // 取代原本「兩次全表查 + JS 迴圈過濾」(published 達數百份時會全撈)。見設計文件 §3-A4。
    const rows = await this.db
      .select({
        category: surveys.category,
        cnt: sql<number>`count(*)::int`,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.status, 'published'),
          eq(surveys.type, 'standard'),
          sql`(${surveys.expiresAt} IS NULL OR ${surveys.expiresAt} > now())`,
          sql`${surveys.completedCount} < ${surveys.targetCount}`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${surveyResponses}
            WHERE ${surveyResponses.surveyId} = ${surveys.id}
              AND ${surveyResponses.respondentId} = ${respondentId}
          )`,
        ),
      )
      .groupBy(surveys.category);

    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.category ?? 'uncategorized'] = Number(r.cnt);
    }
    return counts;
  }

  // ─── 受試者：取得可填的問卷列表（媒合篩選）──────────────────────────────────

  async getAvailableSurveys(respondentId: string, category?: string) {
    // 取出受試者 profile（用於媒合篩選）
    const profileRows = await this.db
      .select()
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, respondentId))
      .limit(1);
    const profile = profileRows[0] ?? null;

    // Phase G.6: 取出受試者的興趣標籤 ids（用於 audience.requiredTagIds 過濾）
    const tagRows = profile
      ? await this.db
          .select({ tagId: respondentTags.tagId })
          .from(respondentTags)
          .where(eq(respondentTags.respondentProfileId, profile.id))
      : [];
    const profileTagIds = new Set(tagRows.map((r) => r.tagId));

    // 抓所有 published 且未過期的問卷
    // Phase 7.6: 高獎勵優先（高信譽分受試者更傾向找好任務）
    // Phase B: mutual 問卷不該出現在標準任務市場(走 /mutual 配對機制)
    const allowedCategories = [
      'consumer', 'academic', 'wellness', 'workplace', 'lifestyle',
      'tech', 'social', 'education', 'finance', 'other',
    ] as const;
    type Cat = typeof allowedCategories[number];
    const normalizedCategory = category && (allowedCategories as readonly string[]).includes(category)
      ? (category as Cat)
      : undefined;

    const whereClause = normalizedCategory
      ? and(eq(surveys.status, 'published'), eq(surveys.type, 'standard'), eq(surveys.category, normalizedCategory))
      : and(eq(surveys.status, 'published'), eq(surveys.type, 'standard'));

    // Subquery: count questions per survey (used for client-side duration/difficulty filters)
    const questionCountSq = this.db
      .select({ surveyId: surveyQuestions.surveyId, cnt: sql<number>`count(*)::int`.as('cnt') })
      .from(surveyQuestions)
      .groupBy(surveyQuestions.surveyId)
      .as('qc');

    const allPublished = await this.db
      .select({
        id: surveys.id,
        title: surveys.title,
        description: surveys.description,
        category: surveys.category,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryPrize: surveys.lotteryPrize,
        lotteryWinnerCount: surveys.lotteryWinnerCount,
        lotteryDrawMode: surveys.lotteryDrawMode,
        lotteryDrawAt: surveys.lotteryDrawAt,
        targetCount: surveys.targetCount,
        completedCount: surveys.completedCount,
        expiresAt: surveys.expiresAt,
        audienceCriteria: surveys.audienceCriteria,
        isAnonymous: surveys.isAnonymous,
        publishedAt: surveys.publishedAt,
        // QUA-34: 加急等級（任務卡顯示「加急」徽章，提示較高獎勵/急件）
        deadlineTier: surveys.deadlineTier,
        // QUA-279: 封面圖片（任務列表卡片背景用）
        coverImageUrl: surveys.coverImageUrl,
        // 外部問卷連結 + 建立者預估分鐘數（任務卡顯示「外部問卷」徽章與填答時間）
        externalUrl: surveys.externalUrl,
        estimatedMinutes: surveys.estimatedMinutes,
        questionCount: sql<number>`coalesce(${questionCountSq.cnt}, 0)`,
      })
      .from(surveys)
      .leftJoin(questionCountSq, sql`${surveys.id} = ${questionCountSq.surveyId}`)
      .where(whereClause)
      .orderBy(desc(surveys.rewardPoints), desc(surveys.publishedAt));

    // 已有填答紀錄的問卷 id。包含待審、退件與已發獎，避免列表顯示後提交才撞 unique constraint。
    const submittedRows = await this.db
      .select({ surveyId: surveyResponses.surveyId })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.respondentId, respondentId),
        ),
      );
    const submittedIds = new Set(submittedRows.map((r) => r.surveyId));

    const now = new Date();

    return allPublished.filter((s) => {
      // 已填過 → 不顯示
      if (submittedIds.has(s.id)) return false;
      // 已過期 → 不顯示
      if (s.expiresAt && new Date(s.expiresAt) < now) return false;
      // 已達配額 → 不顯示
      if (s.completedCount >= s.targetCount) return false;
      // 受眾篩選
      if (s.audienceCriteria && profile) {
        return matchAudience(s.audienceCriteria as AudienceCriteria, profile, profileTagIds);
      }
      return true;
    });
  }

  // ─── 受試者：取得公開問卷詳情（含題目）────────────────────────────────────

  async getPublicSurvey(surveyId: string, respondentId?: string, anonToken?: string) {
    const rows = await this.db
      .select()
      .from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.status, 'published')))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在或尚未上架');

    // 若受試者已填 → 告知（支援 authenticated respondentId 和 anonymous token）
    let alreadySubmitted = false;
    const resolvedRespondentId = respondentId ?? (anonToken
      ? await this.resolveAnonymousRespondentReadOnly(anonToken)
      : undefined);
    if (resolvedRespondentId) {
      const existing = await this.db
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.surveyId, surveyId),
            eq(surveyResponses.respondentId, resolvedRespondentId),
          ),
        )
        .limit(1);
      alreadySubmitted = existing.length > 0;
    }

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const options =
      qIds.length > 0
        ? await this.db
            .select()
            .from(questionOptions)
            .where(
              qIds.length === 1
                ? eq(questionOptions.questionId, qIds[0])
                : inArray(questionOptions.questionId, qIds),
            )
            .orderBy(questionOptions.sortOrder)
        : [];

    // QUA-204: Generate a preview seed so the frontend can shuffle consistently
    const previewSeed = generateSeed();

    return {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      rewardPoints: survey.rewardPoints,
      rewardMode: survey.rewardMode,
      lotteryPrize: survey.lotteryPrize,
      lotteryWinnerCount: survey.lotteryWinnerCount,
      lotteryDrawMode: survey.lotteryDrawMode,
      lotteryDrawAt: survey.lotteryDrawAt,
      lotteryTermsAcceptedAt: survey.lotteryTermsAcceptedAt,
      isAnonymous: survey.isAnonymous,
      theme: survey.theme,
      // 外部問卷：非空 → 填答頁改顯示「跳轉外部頁面」而非站內題目
      externalUrl: survey.externalUrl,
      estimatedMinutes: survey.estimatedMinutes,
      // 問卷歡迎頁橫幅圖（建立者上傳的封面圖，亦顯示於填答歡迎頁）
      coverImageUrl: survey.coverImageUrl,
      // 歡迎頁可插入的多張圖片（依序顯示於描述之後）
      welcomeImages: survey.welcomeImages ?? [],
      alreadySubmitted,
      randomizationSeed: previewSeed,
      questions: questions.map((q) => {
        const shuffleMode = ((q.config as Record<string, unknown> | null)?.shuffleOption as ShuffleOption) ?? 'none';
        const rawOptions = options.filter((o) => o.questionId === q.id);
        const shuffledOpts = shuffleOptions(rawOptions, shuffleMode, previewSeed);
        return {
          id: q.id,
          type: q.type,
          title: q.title,
          description: q.description,
          sortOrder: q.sortOrder,
          isRequired: q.isRequired,
          config: q.config,
          imageUrl: q.imageUrl,
          options: shuffledOpts,
        };
      }),
    };
  }

  // ─── 受試者：提交填答 ────────────────────────────────────────────────────

  async submitResponse(surveyId: string, respondentId: string, dto: SubmitResponseDto) {
    // ── 0. Phase 5.5: 停權檢查 ───────────────────────────────────────────────
    await this.assertNotSuspended(respondentId);

    // ── 1. 確認問卷上架 ──────────────────────────────────────────────────────
    const surveyRows = await this.db
      .select({
        id: surveys.id,
        status: surveys.status,
        title: surveys.title,
        targetCount: surveys.targetCount,
        completedCount: surveys.completedCount,
        surveyorId: surveys.surveyorId,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryPrize: surveys.lotteryPrize,
        lotteryDrawMode: surveys.lotteryDrawMode,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (survey.status !== 'published') throw new BadRequestException('此問卷目前不開放填答');
    if (survey.completedCount >= survey.targetCount) throw new BadRequestException('此問卷已達配額');

    // ── 2. 防止重複提交 ──────────────────────────────────────────────────────
    const existing = await this.db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(surveyResponses.respondentId, respondentId),
        ),
      )
      .limit(1);

    if (existing.length > 0) throw new ConflictException('您已填寫過此問卷');

    // ── 3. 計算填答時間 ──────────────────────────────────────────────────────
    const now = new Date();
    let fillDurationSeconds: number | null = null;
    if (dto.startedAt) {
      const started = new Date(dto.startedAt);
      fillDurationSeconds = Math.round((now.getTime() - started.getTime()) / 1000);
    }

    // ── 4. 反作弊評估 + 驗證答案歸屬 ────────────────────────────────────────
    const surveyQRows = await this.db
      .select({
        id: surveyQuestions.id,
        type: surveyQuestions.type,
        config: surveyQuestions.config,
        isRequired: surveyQuestions.isRequired,
      })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));

    // Validate that every submitted questionId belongs to this survey.
    // Without this check, a user could submit questionIds from other surveys,
    // corrupting analytics without a DB-level error.
    const validQuestionIds = new Set(surveyQRows.map((q) => q.id));
    const invalidIds = dto.answers
      .filter((a) => a.questionId && !validQuestionIds.has(a.questionId))
      .map((a) => a.questionId);
    if (invalidIds.length > 0) {
      throw new BadRequestException('填答包含不屬於此問卷的題目');
    }
    if (new Set(dto.answers.map((answer) => answer.questionId)).size !== dto.answers.length) {
      throw new BadRequestException('同一題目只能提交一份答案');
    }
    const questionsById = new Map(surveyQRows.map((question) => [question.id, question]));
    for (const answer of dto.answers) {
      if (answer.ratingValue === undefined) continue;
      const question = questionsById.get(answer.questionId)!;
      if (question.type !== 'rating') {
        throw new BadRequestException('只有評分題可以提交評分答案');
      }
      const config = typeof question.config === 'object' && question.config !== null && !Array.isArray(question.config)
        ? question.config as Record<string, unknown>
        : {};
      const rawMax = typeof config.maxRating === 'number' ? config.maxRating : 5;
      const max = Math.max(2, Math.min(10, Math.round(rawMax)));
      const min = config.scaleStart === 0 ? 0 : 1;
      if (answer.ratingValue < min || answer.ratingValue > max) {
        throw new BadRequestException(`評分答案必須介於 ${min} 至 ${max} 之間`);
      }
    }
    const selectedOptionIds = dto.answers
      .flatMap((answer) => answer.selectedOptionIds ?? [])
      .filter((optionId) => optionId !== 'yes' && optionId !== 'no');
    if (dto.answers.some((answer) => answer.selectedOptionIds?.length)) {
      const optionRows = await this.db
        .select({ id: questionOptions.id, questionId: questionOptions.questionId })
        .from(questionOptions)
        .where(selectedOptionIds.length > 0
          ? inArray(questionOptions.id, [...new Set(selectedOptionIds)])
          : sql`false`);
      const optionQuestionIds = new Map(optionRows.map((option) => [option.id, option.questionId]));
      for (const answer of dto.answers) {
        if (!answer.selectedOptionIds?.length) continue;
        const question = questionsById.get(answer.questionId)!;
        if (question.type !== 'single_choice' && question.type !== 'multiple_choice') {
          throw new BadRequestException('只有選擇題可以提交選項答案');
        }
        if (question.type === 'single_choice' && answer.selectedOptionIds.length !== 1) {
          throw new BadRequestException('單選題只能提交一個選項');
        }
        const config = typeof question.config === 'object' && question.config !== null && !Array.isArray(question.config)
          ? question.config as Record<string, unknown>
          : {};
        if (
          question.type === 'single_choice'
          && config.variant === 'yes_no'
          && answer.selectedOptionIds.every((optionId) => optionId === 'yes' || optionId === 'no')
        ) {
          continue;
        }
        if (
          new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length
          || answer.selectedOptionIds.some((optionId) => optionQuestionIds.get(optionId) !== answer.questionId)
        ) {
          throw new BadRequestException('選項答案不屬於對應題目');
        }
      }
    }

    // ── 4.5 QUA-204: Accept randomizationSeed from client for reproducibility ─
    const randomizationSeed = dto.randomizationSeed ?? generateSeed();

    // ── 4.5 QUA-196: Evaluate skip logic / conditional branching ──────────────
    // If the survey has logic rules, validate that the respondent only answered
    // visible questions and didn't skip required visible ones.
    const logicRuleRows = await this.db
      .select()
      .from(surveyLogicRules)
      .where(eq(surveyLogicRules.surveyId, surveyId))
      .orderBy(surveyLogicRules.sortOrder);

    const answersByQuestionId = new Map(dto.answers.map((answer) => [answer.questionId, answer]));
    if (logicRuleRows.length === 0) {
      const missingRequired = surveyQRows.filter(
        (question) => question.isRequired && !this.hasAnswerValue(question.type, answersByQuestionId.get(question.id)),
      );
      if (missingRequired.length > 0) {
        throw new BadRequestException('尚有必填題目未作答');
      }
    }

    if (logicRuleRows.length > 0) {
      // Build answers map for condition evaluation
      const answersMap: Record<string, { textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }> = {};
      for (const a of dto.answers) {
        if (a.questionId) {
          answersMap[a.questionId] = {
            textAnswer: a.textAnswer,
            selectedOptionIds: a.selectedOptionIds,
            ratingValue: a.ratingValue,
          };
        }
      }

      // Get questions sorted by order (with isRequired info)
      const allSurveyQuestions = await this.db
        .select({ id: surveyQuestions.id, isRequired: surveyQuestions.isRequired, sortOrder: surveyQuestions.sortOrder })
        .from(surveyQuestions)
        .where(eq(surveyQuestions.surveyId, surveyId))
        .orderBy(surveyQuestions.sortOrder);

      // Determine which questions should be visible
      const visibleIds = new Set(allSurveyQuestions.map((q) => q.id));

      // Apply 'show' rules: target hidden unless trigger condition met
      for (const rule of logicRuleRows.filter((r) => r.action === 'show')) {
        if (!this.evaluateLogicCondition(rule.triggerQuestionId, rule.condition, rule.value, answersMap)) {
          visibleIds.delete(rule.targetQuestionId);
        }
      }

      // Apply 'hide' rules: target visible unless trigger condition met
      for (const rule of logicRuleRows.filter((r) => r.action === 'hide')) {
        if (this.evaluateLogicCondition(rule.triggerQuestionId, rule.condition, rule.value, answersMap)) {
          visibleIds.delete(rule.targetQuestionId);
        }
      }

      // Apply 'skip' rules: skip questions between trigger and target
      const allQIds = allSurveyQuestions.map((q) => q.id);
      for (const rule of logicRuleRows.filter((r) => r.action === 'skip')) {
        if (this.evaluateLogicCondition(rule.triggerQuestionId, rule.condition, rule.value, answersMap)) {
          const triggerIdx = allQIds.indexOf(rule.triggerQuestionId);
          const targetIdx = allQIds.indexOf(rule.targetQuestionId);
          if (triggerIdx !== -1 && targetIdx !== -1) {
            const [from, to] = triggerIdx < targetIdx
              ? [triggerIdx + 1, targetIdx - 1]
              : [targetIdx + 1, triggerIdx - 1];
            for (let i = from; i <= to; i++) {
              visibleIds.delete(allQIds[i]);
            }
          }
        }
      }

      // Validate: answered questions must be visible
      const submittedIds = new Set(
        dto.answers
          .filter((answer) => this.hasAnswerValue(questionsById.get(answer.questionId)!.type, answer))
          .map((answer) => answer.questionId),
      );
      const hiddenButAnswered = [...submittedIds].filter((id) => !visibleIds.has(id));
      if (hiddenButAnswered.length > 0) {
        throw new BadRequestException('填答包含了依據跳題邏輯應被隱藏的題目');
      }

      // Validate: required visible questions must be answered
      const requiredVisible = allSurveyQuestions.filter((q) => q.isRequired && visibleIds.has(q.id));
      const missingRequired = requiredVisible.filter(
        (question) => !this.hasAnswerValue(
          questionsById.get(question.id)!.type,
          answersByQuestionId.get(question.id),
        ),
      );
      if (missingRequired.length > 0) {
        throw new BadRequestException('尚有必填題目未作答');
      }

      // Filter out answers for hidden questions before saving
      dto.answers = dto.answers.filter((a) => !a.questionId || visibleIds.has(a.questionId));
    }

    const antiCheatResult = this.antiCheat.evaluate(
      dto.answers,
      surveyQRows.length,
      fillDurationSeconds,
      dto.behaviorLog,
    );

    // 極度可疑（score >= 80）→ 直接標記 rejected，不計入配額
    // Phase 1: openText 字數 > 10 時先進 pending_review（待人工覆核，不先發獎勵）
    const hasOpenTextOverThreshold = dto.answers.some(
      (a) => typeof a.textAnswer === 'string' && a.textAnswer.trim().length > 10,
    );
    const finalStatus = antiCheatResult.score >= 80
      ? 'rejected'
      : hasOpenTextOverThreshold
        ? 'pending_review'
        : 'submitted';

    // ── 5+6. 建立 response 記錄 + 寫入答案（atomic: 避免 orphaned response）──────
    let responseId = '' as string;
    try {
    await this.db.transaction(async (tx) => {
      if (finalStatus === 'submitted') {
        const [quota] = await tx
          .update(surveys)
          .set({ completedCount: sql`${surveys.completedCount} + 1` })
          .where(and(
            eq(surveys.id, surveyId),
            eq(surveys.status, 'published'),
            sql`${surveys.completedCount} < ${surveys.targetCount}`,
          ))
          .returning({ completedCount: surveys.completedCount, targetCount: surveys.targetCount });
        if (!quota) throw new BadRequestException('此問卷已達配額或不再開放填答');
        if (quota.completedCount >= quota.targetCount) {
          await tx
            .update(surveys)
            .set({ status: 'closed' })
            .where(eq(surveys.id, surveyId));
        }
      }

      const inserted = await tx
        .insert(surveyResponses)
        .values({
          surveyId,
          respondentId,
          status: finalStatus,
          submittedAt: now,
          fillDurationSeconds,
          antiCheatScore: antiCheatResult.score,
          randomizationSeed,
          fingerprintId: dto.fingerprintId ?? null,
          suspiciousFlags: antiCheatResult.flags.length > 0 ? antiCheatResult.flags : null,
          behaviorLog: dto.behaviorLog ?? null,
        })
        .returning({ id: surveyResponses.id });

      responseId = inserted[0].id;

      if (dto.answers.length > 0) {
        await tx.insert(responseAnswers).values(
          dto.answers.map((a) => ({
            responseId: responseId!,
            surveyId, // 反正規化（§3-B1）
            questionId: a.questionId,
            textAnswer: a.textAnswer,
            selectedOptionIds: a.selectedOptionIds ?? null,
            ratingValue: a.ratingValue,
          })),
        );
      }
    });
    } catch (err: unknown) {
      // Concurrent submission race: unique constraint (23505) means another
      // request already inserted this (surveyId, respondentId) pair.
      // Return 409 instead of leaking a 500.
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException('您已填寫過此問卷');
      }
      throw err;
    }

    // ── 6.5 Quality Audit Pipeline（fire-and-forget，不卡住 submit 回應）────────
    // 配額先原子保留，但發獎與通知統一等品質審核通過後執行。
    void this.runQualityAuditAsync(responseId, {
      fillDurationSeconds,
      windowSwitchCount: dto.behaviorLog?.windowSwitchCount,
      pasteEventCount: dto.behaviorLog?.pasteEventCount,
      totalKeystrokes: dto.behaviorLog?.totalKeystrokes,
      perQuestionTimes: dto.behaviorLog
        ? Object.fromEntries(
            Object.entries(dto.behaviorLog.perQuestionTimeMs).map(([k, v]) => [k, v / 1000]),
          )
        : undefined,
    });

    if (finalStatus === 'pending_review') {
      return {
        message: survey.rewardMode === 'lottery'
          ? '已收到填答，正在進行人工複核，通過後會取得抽獎資格。'
          : '已收到填答，正在進行人工複核，完成後會決定是否發放獎勵。',
        responseId,
        flagged: true,
      };
    }

    if (finalStatus === 'rejected') {
      return {
        message: '您的填答已記錄，但系統偵測到異常，請確保認真作答。',
        responseId,
        flagged: true,
      };
    }

    return {
      message: survey.rewardMode === 'lottery'
        ? `填答已送出，品質審核通過後會取得「${survey.lotteryPrize}」抽獎資格。`
        : '填答已送出，品質審核通過後會發放獎勵。',
      responseId,
      flagged: false,
    };
  }

  async submitPublicResponse(surveyId: string, dto: SubmitResponseDto, anonToken?: string) {
    const [survey] = await this.db
      .select({ rewardMode: surveys.rewardMode })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    if (survey?.rewardMode === 'lottery') {
      throw new BadRequestException('抽獎問卷請登入後填答，以便接收開獎通知');
    }
    const token = (anonToken ?? '').trim();
    if (!token) {
      throw new BadRequestException('Missing x-anon-token');
    }
    const respondentId = await this.resolveAnonymousRespondent(token);
    return this.submitResponse(surveyId, respondentId, dto);
  }

  private async resolveAnonymousRespondentReadOnly(token: string): Promise<string | undefined> {
    const digest = createHash('sha256').update(token).digest('hex');
    const email = `anon+${digest.slice(0, 24)}@guest.quanwen.local`;
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return existing[0]?.id;
  }

  private async resolveAnonymousRespondent(token: string): Promise<string> {
    const digest = createHash('sha256').update(token).digest('hex');
    const email = `anon+${digest.slice(0, 24)}@guest.quanwen.local`;

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const created = await this.db
      .insert(users)
      .values({
        email,
        role: 'respondent',
        displayName: `guest-${digest.slice(0, 8)}`,
        emailVerified: false,
      })
      .returning({ id: users.id });
    return created[0].id;
  }

  // ─── Quality Audit Pipeline 觸發（fire-and-forget）─────────────────────

  private async runQualityAuditAsync(
    responseId: string,
    behavior: {
      fillDurationSeconds: number | null;
      windowSwitchCount?: number;
      pasteEventCount?: number;
      totalKeystrokes?: number;
      perQuestionTimes?: Record<string, number>;
    },
  ): Promise<void> {
    try {
      const [previous] = await this.db
        .select({
          status: surveyResponses.status,
          surveyId: surveyResponses.surveyId,
          respondentId: surveyResponses.respondentId,
          surveyorId: surveys.surveyorId,
          title: surveys.title,
          targetCount: surveys.targetCount,
          completedCount: surveys.completedCount,
          rewardPoints: surveys.rewardPoints,
          rewardMode: surveys.rewardMode,
          lotteryDrawMode: surveys.lotteryDrawMode,
          lotteryPrize: surveys.lotteryPrize,
          lotteryDrawnAt: surveys.lotteryDrawnAt,
          qualityScore: surveyResponses.qualityScore,
        })
        .from(surveyResponses)
        .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
        .where(eq(surveyResponses.id, responseId))
        .limit(1);
      const breakdown = await this.qualityAudit.audit(responseId, behavior);
      // 寫回 DB
      let newStatus: 'rejected' | 'pending_review' | 'submitted' = breakdown.status === 'rejected'
        ? 'rejected'
        : breakdown.status === 'suspicious'
          ? 'pending_review'
          : 'submitted';
      let promotedAcceptedCount: number | null = null;
      if (
        previous
        && !['submitted', 'rewarded'].includes(previous.status)
        && ['submitted', 'rewarded'].includes(newStatus)
      ) {
        const [quota] = await this.db
          .update(surveys)
          .set({ completedCount: sql`${surveys.completedCount} + 1` })
          .where(and(
            eq(surveys.id, previous.surveyId),
            eq(surveys.status, 'published'),
            sql`${surveys.completedCount} < ${surveys.targetCount}`,
          ))
          .returning({ completedCount: surveys.completedCount, targetCount: surveys.targetCount });
        if (!quota) {
          newStatus = 'pending_review';
        } else {
          promotedAcceptedCount = quota.completedCount;
          if (quota.completedCount >= quota.targetCount) {
            await this.db
              .update(surveys)
              .set({ status: 'closed' })
              .where(eq(surveys.id, previous.surveyId));
          }
        }
      }
      await this.db
        .update(surveyResponses)
        .set({
          qualityScore: breakdown.finalScore,
          qualityBreakdown: breakdown,
          status: newStatus,
        })
        .where(eq(surveyResponses.id, responseId));

      if (
        previous
        && ['submitted', 'rewarded'].includes(newStatus)
        && (
          promotedAcceptedCount !== null
          || (['submitted', 'rewarded'].includes(previous.status) && previous.qualityScore === null)
        )
      ) {
        await this.handleAcceptedResponseAfterAudit(
          previous,
          responseId,
          promotedAcceptedCount ?? previous.completedCount,
        );
      }

      if (
        previous
        && ['submitted', 'rewarded'].includes(previous.status)
        && !['submitted', 'rewarded'].includes(newStatus)
        && (previous.rewardMode !== 'lottery' || !previous.lotteryDrawnAt)
      ) {
        await this.db
          .update(surveys)
          .set({
            completedCount: sql`GREATEST(${surveys.completedCount} - 1, 0)`,
            status: sql`CASE WHEN ${surveys.status} = 'closed' THEN 'published'::survey_status ELSE ${surveys.status} END`,
          })
          .where(and(
            eq(surveys.id, previous.surveyId),
            previous.rewardMode === 'lottery' ? isNull(surveys.lotteryDrawnAt) : undefined,
          ));
      }

      // 被 reject 時把預算退回給問券方（如果之前有預扣）+ 通知受試者 + 扣信譽分
      if (breakdown.status === 'rejected') {
        const respRows = await this.db
          .select({ respondentId: surveyResponses.respondentId, surveyId: surveyResponses.surveyId })
          .from(surveyResponses)
          .where(eq(surveyResponses.id, responseId))
          .limit(1);
        const r = respRows[0];
        if (r) {
          await this.notifications.create({
            userId: r.respondentId,
            type: 'system',
            title: '填答未通過品質審核',
            body: `分數 ${breakdown.finalScore} / 100。${breakdown.llmReasoning ?? '請查看詳情並可申訴'}`,
            metadata: { responseId, finalScore: breakdown.finalScore },
          });
          // Phase 5.4 + 5.5: 扣信譽分、檢查連續退件停權
          await this.applyRejectionPenalty(r.respondentId);
        }
      }
      this.logger.log(`Quality audit ${responseId}: ${breakdown.finalScore} (${breakdown.status})`);
    } catch (err) {
      this.logger.error(`Quality audit failed for ${responseId}`, err);
    }
  }

  private async handleAcceptedResponseAfterAudit(
    survey: {
      surveyId: string;
      respondentId: string;
      surveyorId: string;
      title: string;
      targetCount: number;
      rewardPoints: number;
      rewardMode: string;
      lotteryDrawMode: string | null;
      lotteryPrize?: string | null;
    },
    responseId: string,
    acceptedCount: number,
  ): Promise<void> {
    if (acceptedCount >= survey.targetCount && survey.rewardMode === 'lottery' && survey.lotteryDrawMode === 'when_full') {
      this.surveyLottery
        ?.draw(survey.surveyId)
        .catch((err: unknown) =>
          this.logger.error(`問卷抽獎失敗 surveyId=${survey.surveyId}`, err),
        );
    }
    await this.updateRespondentStats(survey.respondentId);
    this.spin
      .grantChance(survey.respondentId, 1, '完成標準填答')
      .catch((err: unknown) =>
        this.logger.error(`轉盤次數發放失敗 respondentId=${survey.respondentId}`, err),
      );
    if (survey.rewardMode === 'fixed' && survey.rewardPoints > 0) {
      this.walletService
        .issueReward({
          surveyId: survey.surveyId,
          responseId,
          respondentId: survey.respondentId,
          surveyorId: survey.surveyorId,
          rewardAmount: survey.rewardPoints,
        })
        .catch((err: unknown) =>
          this.logger.error(`獎勵發放失敗 responseId=${responseId}`, err),
        );
    }
    this.notifications
      .create({
        userId: survey.surveyorId,
        type: 'new_response',
        title: '有新的問卷填答',
        body: `您的問卷「${survey.title}」收到一份新填答（累計 ${acceptedCount} / ${survey.targetCount} 份）`,
        metadata: { surveyId: survey.surveyId, responseId },
      })
      .catch((err: unknown) =>
        this.logger.error(`new_response 通知失敗 surveyId=${survey.surveyId}`, err),
      );
    if (survey.rewardMode === 'lottery') {
      this.notifications
        .create({
          userId: survey.respondentId,
          type: 'system',
          title: '抽獎資格已確認',
          body: `您已取得問卷「${survey.title}」的抽獎資格${survey.lotteryPrize ? `：「${survey.lotteryPrize}」` : ''}。開獎後系統會通知您是否中獎。`,
          metadata: { surveyId: survey.surveyId, responseId, lottery: true },
        })
        .catch((err: unknown) =>
          this.logger.error(`lottery eligibility 通知失敗 respondentId=${survey.respondentId}`, err),
        );
    } else {
      this.notifications
        .sendRespondentThankYou(survey.respondentId, survey.title, survey.rewardPoints)
        .catch((err: unknown) =>
          this.logger.error(`thank-you email 失敗 respondentId=${survey.respondentId}`, err),
        );
    }

    const milestones = [50, 100, 500, 1000] as const;
    const hitMilestone = milestones.find((milestone) => acceptedCount === milestone);
    if (hitMilestone) {
      this.notifications
        .create({
          userId: survey.surveyorId,
          type: 'response_milestone',
          title: `里程碑達成！您的問卷已收到 ${hitMilestone} 份填答 🎉`,
          body: `恭喜！您的問卷「${survey.title}」已累計收到 ${hitMilestone} 份填答。${
            hitMilestone >= 500
              ? '您正在收集大量有價值的數據，繼續加油！'
              : '持續收集更多回覆，讓數據更有代表性。'
          }`,
          metadata: { surveyId: survey.surveyId, milestone: hitMilestone, completedCount: acceptedCount, targetCount: survey.targetCount },
        })
        .catch((err: unknown) =>
          this.logger.error(`milestone 通知失敗 surveyId=${survey.surveyId} milestone=${hitMilestone}`, err),
        );
    }
  }

  async retryQualityAudit(responseId: string): Promise<{ message: string; responseId: string }> {
    const [response] = await this.db
      .select({
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        behaviorLog: surveyResponses.behaviorLog,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    if (!response) throw new NotFoundException('填答不存在');

    const behaviorLog = response.behaviorLog as BehaviorLogDto | null;
    await this.runQualityAuditAsync(responseId, {
      fillDurationSeconds: response.fillDurationSeconds,
      windowSwitchCount: behaviorLog?.windowSwitchCount,
      pasteEventCount: behaviorLog?.pasteEventCount,
      totalKeystrokes: behaviorLog?.totalKeystrokes,
      perQuestionTimes: behaviorLog
        ? Object.fromEntries(
            Object.entries(behaviorLog.perQuestionTimeMs).map(([key, value]) => [key, value / 1000]),
          )
        : undefined,
    });
    return { message: '重新審核完成', responseId };
  }

  async approvePendingResponse(responseId: string): Promise<{ message: string; responseId: string }> {
    const [pending] = await this.db
      .select({
        status: surveyResponses.status,
        surveyId: surveyResponses.surveyId,
        respondentId: surveyResponses.respondentId,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        targetCount: surveys.targetCount,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryDrawMode: surveys.lotteryDrawMode,
        lotteryPrize: surveys.lotteryPrize,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    if (!pending) throw new NotFoundException('填答不存在');
    if (pending.status !== 'pending_review') {
      throw new ConflictException('只有待人工審核的填答可以核准');
    }
    if (pending.rewardMode === 'lottery' && pending.lotteryDrawnAt) {
      throw new ConflictException('抽獎已完成，無法再補入參與名單');
    }

    const acceptedCount = await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(surveyResponses)
        .set({ status: 'submitted' })
        .where(and(eq(surveyResponses.id, responseId), eq(surveyResponses.status, 'pending_review')))
        .returning({ id: surveyResponses.id });
      if (claimed.length === 0) throw new ConflictException('此填答已被其他管理員處理');

      const [quota] = await tx
        .update(surveys)
        .set({ completedCount: sql`${surveys.completedCount} + 1` })
        .where(and(
          eq(surveys.id, pending.surveyId),
          pending.rewardMode === 'lottery'
            ? inArray(surveys.status, ['published', 'closed'])
            : eq(surveys.status, 'published'),
          sql`${surveys.completedCount} < ${surveys.targetCount}`,
        ))
        .returning({ completedCount: surveys.completedCount, targetCount: surveys.targetCount });
      if (!quota) throw new ConflictException('問卷已達配額或不再開放，無法核准此填答');

      if (quota.completedCount >= quota.targetCount) {
        await tx
          .update(surveys)
          .set({ status: 'closed' })
          .where(eq(surveys.id, pending.surveyId));
      }
      return quota.completedCount;
    });
    await this.handleAcceptedResponseAfterAudit(pending, responseId, acceptedCount);

    return { message: '填答已由人工核准並恢復有效資格', responseId };
  }

  // ─── 受試者信譽分更新 ─────────────────────────────────────────────────────

  private async updateRespondentStats(respondentId: string) {
    const profileRows = await this.db
      .select({
        id: respondentProfiles.id,
        totalCompleted: respondentProfiles.totalCompleted,
      })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, respondentId))
      .limit(1);

    if (profileRows.length === 0) return;
    const profile = profileRows[0];
    const newTotal = profile.totalCompleted + 1;

    await this.db
      .update(respondentProfiles)
      .set({ totalCompleted: newTotal, updatedAt: new Date() })
      .where(eq(respondentProfiles.id, profile.id));

    // 每完成 10 份 +1 分（透過 ReputationService 記入歷史）
    if (newTotal % 10 === 0) {
      await this.reputation.adjust(respondentId, 1, `完成 ${newTotal} 份問卷`);
    }
  }

  // ─── Phase 5.5：停權檢查（過期會自動清除）─────────────────────────────────
  private async assertNotSuspended(respondentId: string) {
    const rows = await this.db
      .select({
        id: respondentProfiles.id,
        suspendedUntil: respondentProfiles.suspendedUntil,
        suspendedReason: respondentProfiles.suspendedReason,
      })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, respondentId))
      .limit(1);

    const profile = rows[0];
    if (!profile?.suspendedUntil) return;

    const now = new Date();
    if (profile.suspendedUntil > now) {
      const days = Math.ceil(
        (profile.suspendedUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      throw new ForbiddenException(
        `${profile.suspendedReason ?? '帳號暫停接案'}（剩 ${days} 天）`,
      );
    }
    // 已過期 → 自動解除
    await this.db
      .update(respondentProfiles)
      .set({ suspendedUntil: null, suspendedReason: null, updatedAt: now })
      .where(eq(respondentProfiles.id, profile.id));
  }

  // ─── Phase 5.4 + 5.5：rejected 時扣分 / 連續退件停權 ───────────────────────
  private async applyRejectionPenalty(respondentId: string) {
    // 5.4：扣 5 分（走 ReputationService，自動寫歷史）
    await this.reputation.adjust(respondentId, -5, '填答未通過品質審核');

    // 5.5：查最近 3 筆「已審核完」的回答（rejected/rewarded/submitted = audit 完成的狀態）
    //     排除 in_progress，否則填到一半的草稿會稀釋計算
    const recent = await this.db
      .select({ status: surveyResponses.status, submittedAt: surveyResponses.submittedAt })
      .from(surveyResponses)
      .where(and(
        eq(surveyResponses.respondentId, respondentId),
        inArray(surveyResponses.status, ['rejected', 'rewarded', 'submitted']),
      ))
      .orderBy(desc(surveyResponses.submittedAt))
      .limit(3);

    if (recent.length === 3 && recent.every((r) => r.status === 'rejected')) {
      const suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const suspendedReason = '連續 3 次填答被退件，暫停接案 7 天';

      const profileRows = await this.db
        .select({ id: respondentProfiles.id })
        .from(respondentProfiles)
        .where(eq(respondentProfiles.userId, respondentId))
        .limit(1);

      if (profileRows[0]) {
        await this.db
          .update(respondentProfiles)
          .set({ suspendedUntil, suspendedReason, updatedAt: new Date() })
          .where(eq(respondentProfiles.id, profileRows[0].id));
      }

      await this.notifications.create({
        userId: respondentId,
        type: 'system',
        title: '帳號暫停接案 7 天',
        body: '您最近 3 次填答品質都未通過。系統暫停您接案 7 天，期間您仍可申訴。',
        metadata: { suspendedUntil: suspendedUntil.toISOString() },
      });
      this.logger.warn(`受試者 ${respondentId} 連續 3 次 rejected → 停權 7 天`);
    }
  }

  // ─── 受試者：查看自己的填答紀錄 ────────────────────────────────────────────

  async getMyResponses(respondentId: string) {
    const rows = await this.db
      .select({
        responseId: surveyResponses.id,
        surveyId: surveyResponses.surveyId,
        status: surveyResponses.status,
        submittedAt: surveyResponses.submittedAt,
        surveyTitle: surveys.title,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryPrize: surveys.lotteryPrize,
        lotteryWinnerCount: surveys.lotteryWinnerCount,
        lotteryDrawMode: surveys.lotteryDrawMode,
        lotteryDrawAt: surveys.lotteryDrawAt,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
        qualityScore: surveyResponses.qualityScore,
        qualityBreakdown: surveyResponses.qualityBreakdown,
        suspiciousFlags: surveyResponses.suspiciousFlags,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(eq(surveyResponses.respondentId, respondentId))
      .orderBy(desc(surveyResponses.submittedAt));

    return rows;
  }

  // ─── 問券方：取得問卷填答統計 ────────────────────────────────────────────────

  async getSurveyStats(surveyId: string, surveyorId: string) {
    // 確認是問券方本人
    const surveyRows = await this.db
      .select({
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        completedCount: surveys.completedCount,
        targetCount: surveys.targetCount,
        rewardMode: surveys.rewardMode,
        lotteryPrize: surveys.lotteryPrize,
        lotteryWinnerCount: surveys.lotteryWinnerCount,
        lotteryDrawMode: surveys.lotteryDrawMode,
        lotteryDrawAt: surveys.lotteryDrawAt,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (survey.surveyorId !== surveyorId) throw new ForbiddenException('無權存取此問卷統計');

    // 取所有已提交的 answers
    const answers = await this.db
      .select({
        questionId: responseAnswers.questionId,
        textAnswer: responseAnswers.textAnswer,
        selectedOptionIds: responseAnswers.selectedOptionIds,
        ratingValue: responseAnswers.ratingValue,
      })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          // 已 submit + 已 reward 都應該算進統計（rewarded 是 submitted 的後續狀態）
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const options =
      qIds.length > 0
        ? await this.db
            .select()
            .from(questionOptions)
            .where(
              qIds.length === 1
                ? eq(questionOptions.questionId, qIds[0])
                : inArray(questionOptions.questionId, qIds),
            )
        : [];

    // 逐題彙整統計
    const questionStats = questions.map((q) => {
      const qAnswers = answers.filter((a) => a.questionId === q.id);
      const qOptions = options.filter((o) => o.questionId === q.id);

      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        const answeredChoices = qAnswers.filter((answer) => {
          const ids = answer.selectedOptionIds as string[] | null;
          return ids?.length;
        });
        const config = typeof q.config === 'object' && q.config !== null && !Array.isArray(q.config)
          ? q.config as Record<string, unknown>
          : {};
        const statOptions = q.type === 'single_choice' && config.variant === 'yes_no'
          ? [{ id: 'yes', label: '是' }, { id: 'no', label: '否' }]
          : qOptions;
        const optionCounts = statOptions.map((o) => ({
          optionId: o.id,
          label: o.label,
          count: qAnswers.filter((a) => {
            const ids = a.selectedOptionIds as string[] | null;
            return ids?.includes(o.id) ?? false;
          }).length,
        }));
        return { questionId: q.id, title: q.title, type: q.type, totalAnswers: answeredChoices.length, optionCounts };
      }

      if (q.type === 'rating') {
        const ratings = qAnswers.map((a) => a.ratingValue).filter((v): v is number => v !== null);
        const avg = ratings.length > 0 ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null;
        const config = typeof q.config === 'object' && q.config !== null && !Array.isArray(q.config)
          ? q.config as Record<string, unknown>
          : {};
        const rawMax = typeof config.maxRating === 'number' ? config.maxRating : 5;
        const ratingMax = Math.max(2, Math.min(10, Math.round(rawMax)));
        const ratingMin = config.scaleStart === 0 ? 0 : 1;
        const buckets: { value: number; count: number }[] = [];
        for (let v = ratingMin; v <= ratingMax; v++) {
          buckets.push({ value: v, count: ratings.filter((r) => r === v).length });
        }
        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          totalAnswers: ratings.length,
          averageRating: avg,
          ratingMin,
          ratingMax,
          ratingBuckets: buckets,
        };
      }

      // text
      const texts = qAnswers
        .map((a) => a.textAnswer)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return { questionId: q.id, title: q.title, type: q.type, totalAnswers: texts.length, sampleTexts: texts.slice(0, 20) };
    });

    // Phase 3: 品質分布（從 quality_score 統計 passed/suspicious/rejected）
    const qualityRows = await this.db
      .select({
        id: surveyResponses.id,
        qualityScore: surveyResponses.qualityScore,
        status: surveyResponses.status,
      })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          inArray(surveyResponses.status, ['submitted', 'rewarded', 'rejected']),
        ),
      );
    const qualityDistribution = {
      total: qualityRows.length,
      passed: qualityRows.filter((r) => (r.qualityScore ?? 0) >= 80).length,
      suspicious: qualityRows.filter((r) => {
        const s = r.qualityScore ?? 0;
        return s >= 50 && s < 80;
      }).length,
      rejected: qualityRows.filter((r) => (r.qualityScore ?? 0) < 50 || r.status === 'rejected').length,
      unaudited: qualityRows.filter((r) => r.qualityScore === null).length,
      avgScore: qualityRows.length > 0
        ? Math.round(
            qualityRows.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / qualityRows.length,
          )
        : null,
    };

    return {
      surveyId,
      title: survey.title,
      totalResponses: survey.completedCount,
      targetCount: survey.targetCount,
      rewardMode: survey.rewardMode,
      lotteryPrize: survey.lotteryPrize,
      lotteryWinnerCount: survey.lotteryWinnerCount,
      lotteryDrawMode: survey.lotteryDrawMode,
      lotteryDrawAt: survey.lotteryDrawAt,
      lotteryDrawnAt: survey.lotteryDrawnAt,
      questionStats,
      qualityDistribution,
    };
  }

  // ─── 問券方：取得指定題目的逐筆文字回答（供 per-response sentiment 使用）────────

  /**
   * 取得指定問卷 + 題目的所有已提交文字回答，含 responseId。
   * 只回傳有非空白 textAnswer 的列。
   */
  async getTextAnswersForQuestion(
    surveyId: string,
    questionId: string,
    surveyorId: string,
  ): Promise<Array<{ responseId: string; text: string }>> {
    // 確認是問券方本人
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取此問卷');

    const rows = await this.db
      .select({
        responseId: responseAnswers.responseId,
        textAnswer: responseAnswers.textAnswer,
      })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(responseAnswers.surveyId, surveyId),
          eq(responseAnswers.questionId, questionId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    return rows
      .filter((r) => r.textAnswer && r.textAnswer.trim().length > 0)
      .map((r) => ({ responseId: r.responseId, text: r.textAnswer! }));
  }

  // ─── 問券方：每日填答趨勢（近 30 天）────────────────────────────────────────

  async getSurveyTrend(surveyId: string, surveyorId: string): Promise<{ date: string; count: number }[]> {
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取');

    // 近 30 天每天的提交數
    const rows = await this.db
      .select({
        date: sql<string>`DATE(submitted_at AT TIME ZONE 'Asia/Taipei')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(surveyResponses.status, 'submitted'),
          sql`submitted_at >= NOW() - INTERVAL '30 days'`,
        ),
      )
      .groupBy(sql`DATE(submitted_at AT TIME ZONE 'Asia/Taipei')`)
      .orderBy(sql`DATE(submitted_at AT TIME ZONE 'Asia/Taipei')`);

    // 補齊近 30 天的空日期
    const countByDate = new Map(rows.map((r) => [r.date, r.count]));
    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, count: countByDate.get(key) ?? 0 });
    }
    return result;
  }

  // ─── 問券方：受訪者清單（匿名化 token + 提交時間）───────────────────────────

  async getRespondents(
    surveyId: string,
    surveyorId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    total: number;
    page: number;
    pageSize: number;
    respondents: Array<{
      anonymousToken: string;
      status: string;
      submittedAt: string | null;
      fillDurationSeconds: number | null;
      qualityScore: number | null;
    }>;
  }> {
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取');

    const offset = (page - 1) * pageSize;

    const [countRows, rows] = await Promise.all([
      this.db
        .select({ cnt: sql<number>`COUNT(*)::int` })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.surveyId, surveyId),
            inArray(surveyResponses.status, ['submitted', 'rewarded', 'rejected']),
          ),
        ),
      this.db
        .select({
          respondentId: surveyResponses.respondentId,
          status: surveyResponses.status,
          submittedAt: surveyResponses.submittedAt,
          fillDurationSeconds: surveyResponses.fillDurationSeconds,
          qualityScore: surveyResponses.qualityScore,
        })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.surveyId, surveyId),
            inArray(surveyResponses.status, ['submitted', 'rewarded', 'rejected']),
          ),
        )
        .orderBy(desc(surveyResponses.submittedAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = countRows[0]?.cnt ?? 0;

    // 匿名化：用 SHA-256 hash 取代真實 respondentId（只取前 8 碼作為可讀 token）
    const respondents = rows.map((r) => {
      const hash = createHash('sha256').update(r.respondentId).digest('hex');
      return {
        anonymousToken: hash.slice(0, 8).toUpperCase(),
        status: r.status,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        fillDurationSeconds: r.fillDurationSeconds,
        qualityScore: r.qualityScore,
      };
    });

    return { total, page, pageSize, respondents };
  }

  // ─── 問券方：匯出填答 JSON（結構化，給程式/資料分析用）───────────────────

  async exportSurveyResponsesJson(
    surveyId: string,
    surveyorId: string,
    exportOpts: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<{
    survey: { id: string; title: string };
    exportedAt: string;
    totalResponses: number;
    questions: Array<{ id: string; title: string; type: string; order: number }>;
    responses: Array<Record<string, unknown>>;
  }> {
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId, title: surveys.title })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取');

    const questions = await this.db
      .select({ id: surveyQuestions.id, title: surveyQuestions.title, type: surveyQuestions.type, sortOrder: surveyQuestions.sortOrder })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const minScore = exportOpts.minQualityScore ?? 70;
    let responses = await this.db
      .select({
        responseId: surveyResponses.id,
        submittedAt: surveyResponses.submittedAt,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        qualityScore: surveyResponses.qualityScore,
      })
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, surveyId), inArray(surveyResponses.status, ['submitted', 'rewarded'])))
      .orderBy(surveyResponses.submittedAt);
    if (exportOpts.cleanOnly) {
      responses = responses.filter((r) => (r.qualityScore ?? 0) >= minScore);
    }

    const responseIds = responses.map((r) => r.responseId);
    const allAnswers = responseIds.length
      ? await this.db.select().from(responseAnswers).where(inArray(responseAnswers.responseId, responseIds))
      : [];
    const qIds = questions.map((q) => q.id);
    const options = qIds.length
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
      : [];

    const toValue = (a: typeof allAnswers[number] | undefined): unknown => {
      if (!a) return null;
      if (a.textAnswer) return redactPii(a.textAnswer);
      if (a.ratingValue !== null && a.ratingValue !== undefined) return a.ratingValue;
      if (a.selectedOptionIds) {
        const ids = a.selectedOptionIds as string[];
        return ids.map((id) => options.find((o) => o.id === id)?.label ?? id);
      }
      return null;
    };

    return {
      survey: { id: surveyId, title: surveyRows[0].title },
      exportedAt: new Date().toISOString(),
      totalResponses: responses.length,
      questions: questions.map((q) => ({ id: q.id, title: q.title, type: q.type, order: q.sortOrder + 1 })),
      responses: responses.map((r) => {
        const answers = allAnswers.filter((a) => a.responseId === r.responseId);
        return {
          responseId: r.responseId,
          submittedAt: r.submittedAt,
          fillDurationSeconds: r.fillDurationSeconds,
          qualityScore: r.qualityScore,
          answers: questions.map((q) => ({
            questionId: q.id,
            title: q.title,
            value: toValue(answers.find((a) => a.questionId === q.id)),
          })),
        };
      }),
    };
  }

  // ─── 問券方：匯出填答 CSV ─────────────────────────────────────────────────

  async exportSurveyResponsesCsv(
    surveyId: string,
    surveyorId: string,
    exportOpts: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<string> {
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId, title: surveys.title })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取');

    const questions = await this.db
      .select({ id: surveyQuestions.id, title: surveyQuestions.title, type: surveyQuestions.type, sortOrder: surveyQuestions.sortOrder })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    // cleanOnly 模式：只匯出 quality_score >= threshold（預設 70）
    const minScore = exportOpts.minQualityScore ?? 70;
    let responses = await this.db
      .select({
        responseId: surveyResponses.id,
        respondentId: surveyResponses.respondentId,
        submittedAt: surveyResponses.submittedAt,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        antiCheatScore: surveyResponses.antiCheatScore,
        qualityScore: surveyResponses.qualityScore,
      })
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, surveyId), inArray(surveyResponses.status, ['submitted', 'rewarded'])))
      .orderBy(surveyResponses.submittedAt);
    if (exportOpts.cleanOnly) {
      responses = responses.filter((r) => (r.qualityScore ?? 0) >= minScore);
    }

    if (responses.length === 0) return 'response_id,submitted_at\n（無填答資料）';

    const responseIds = responses.map((r) => r.responseId);
    const allAnswers = await this.db
      .select()
      .from(responseAnswers)
      .where(inArray(responseAnswers.responseId, responseIds));

    const qIds = questions.map((q) => q.id);
    const options =
      qIds.length > 0
        ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
        : [];

    // CSV header
    const headers = [
      'response_id', 'submitted_at', 'fill_duration_sec', 'anti_cheat_score', 'quality_score',
      ...questions.map((q) => `Q${q.sortOrder + 1}_${q.title.replace(/,/g, '；').slice(0, 30)}`),
    ];

    const rows = responses.map((r) => {
      const answers = allAnswers.filter((a) => a.responseId === r.responseId);
      const qCells = questions.map((q) => {
        const a = answers.find((ans) => ans.questionId === q.id);
        if (!a) return '';
        if (a.textAnswer) return `"${redactPii(a.textAnswer).replace(/"/g, '""')}"`;
        if (a.ratingValue !== null && a.ratingValue !== undefined) return String(a.ratingValue);
        if (a.selectedOptionIds) {
          const ids = a.selectedOptionIds as string[];
          const labels = ids
            .map((id) => options.find((o) => o.id === id)?.label ?? id)
            .join('|');
          return `"${labels}"`;
        }
        return '';
      });

      return [
        r.responseId,
        r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
        r.fillDurationSeconds ?? '',
        r.antiCheatScore ?? '',
        r.qualityScore ?? '',
        ...qCells,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  async analyzeSentimentCrossTab(surveyId: string, surveyorId: string, field: 'gender' | 'ageRange') {
    const surveyRows = await this.db
      .select({ surveyorId: surveys.surveyorId })
      .from(surveys).where(eq(surveys.id, surveyId)).limit(1);
    if (!surveyRows[0]) throw new NotFoundException('問卷不存在');
    if (surveyRows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取');
    const rows = await this.db
      .select({
        sentiment: surveyResponses.sentiment,
        gender: respondentProfiles.gender,
        ageRange: respondentProfiles.ageRange,
      })
      .from(surveyResponses)
      .innerJoin(respondentProfiles, eq(respondentProfiles.userId, surveyResponses.respondentId))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
          inArray(surveyResponses.sentiment, ['positive', 'neutral', 'negative']),
        ),
      );

    const grouped = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
    for (const r of rows) {
      const group = field === 'gender' ? (r.gender ?? 'unknown') : (r.ageRange ?? 'unknown');
      const cur = grouped.get(group) ?? { positive: 0, neutral: 0, negative: 0, total: 0 };
      const sentiment = r.sentiment as 'positive' | 'neutral' | 'negative';
      cur[sentiment] += 1;
      cur.total += 1;
      grouped.set(group, cur);
    }

    const groups = [...grouped.entries()].map(([label, counts]) => ({
      groupLabel: label,
      positive: counts.positive,
      neutral: counts.neutral,
      negative: counts.negative,
      total: counts.total,
    }));

    return { surveyId, field, groups, generatedAt: new Date().toISOString() };
  }

  // ─── QUA-196: Logic Condition Evaluator ──────────────────────────────────────

  /**
   * Evaluate a single logic condition against the current answer map.
   * Returns true if the condition is satisfied.
   */
  private hasAnswerValue(questionType: string, answer?: AnswerDto): boolean {
    if (!answer) return false;
    if (questionType === 'rating') return typeof answer.ratingValue === 'number';
    if (questionType === 'single_choice' || questionType === 'multiple_choice') {
      return Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0;
    }
    return typeof answer.textAnswer === 'string' && answer.textAnswer.trim().length > 0;
  }

  private evaluateLogicCondition(
    triggerQuestionId: string,
    condition: string,
    value: string | null,
    answersMap: Record<string, { textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>,
  ): boolean {
    const answer = answersMap[triggerQuestionId];

    if (condition === 'is_empty') {
      if (!answer) return true;
      const hasText = typeof answer.textAnswer === 'string' && answer.textAnswer.trim().length > 0;
      const hasOption = Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0;
      const hasRating = typeof answer.ratingValue === 'number';
      return !hasText && !hasOption && !hasRating;
    }

    if (condition === 'is_not_empty') {
      return !this.evaluateLogicCondition(triggerQuestionId, 'is_empty', value, answersMap);
    }

    if (!answer) return false;

    // Numeric comparisons (rating)
    if (['gt', 'gte', 'lt', 'lte'].includes(condition)) {
      const numVal = value !== null ? parseFloat(value) : NaN;
      const rating = answer.ratingValue;
      if (typeof rating !== 'number' || isNaN(numVal)) return false;
      if (condition === 'gt') return rating > numVal;
      if (condition === 'gte') return rating >= numVal;
      if (condition === 'lt') return rating < numVal;
      if (condition === 'lte') return rating <= numVal;
    }

    // Text / option comparisons
    if (condition === 'eq') {
      if (typeof answer.textAnswer === 'string') return answer.textAnswer === value;
      if (Array.isArray(answer.selectedOptionIds)) return answer.selectedOptionIds.includes(value ?? '');
      if (typeof answer.ratingValue === 'number') return answer.ratingValue === parseFloat(value ?? '');
      return false;
    }

    if (condition === 'neq') {
      return !this.evaluateLogicCondition(triggerQuestionId, 'eq', value, answersMap);
    }

    if (condition === 'contains') {
      if (typeof answer.textAnswer === 'string') return answer.textAnswer.includes(value ?? '');
      if (Array.isArray(answer.selectedOptionIds)) return answer.selectedOptionIds.includes(value ?? '');
      return false;
    }

    if (condition === 'not_contains') {
      return !this.evaluateLogicCondition(triggerQuestionId, 'contains', value, answersMap);
    }

    return false;
  }
}

// ─── 受眾媒合 helper ──────────────────────────────────────────────────────────

interface AudienceCriteria {
  ageRange?: string[];
  gender?: string[];
  region?: string[];
  occupation?: string[];
  industry?: string[];
  education?: string[];
  // Phase 7.3: 最低信譽分要求
  minReputationScore?: number;
  // Phase G.6: 需符合的興趣標籤（OR — 受試者只要有任一標籤即通過）
  requiredTagIds?: string[];
  // 'any'（預設）= 任一即可；'all' = 全部要符合
  tagMatchMode?: 'any' | 'all';
}

type RespondentProfilePartial = {
  ageRange?: string | null;
  gender?: string | null;
  region?: string | null;
  occupation?: string | null;
  industry?: string | null;
  education?: string | null;
  reputationScore?: number | null;
};

function matchAudience(
  criteria: AudienceCriteria,
  profile: RespondentProfilePartial,
  profileTagIds?: Set<string>,
): boolean {
  const checks: [keyof AudienceCriteria, string | null | undefined][] = [
    ['ageRange', profile.ageRange],
    ['gender', profile.gender],
    ['region', profile.region],
    ['occupation', profile.occupation],
    ['industry', profile.industry],
    ['education', profile.education],
  ];

  for (const [field, profileValue] of checks) {
    const allowed = criteria[field];
    if (!Array.isArray(allowed) || allowed.length === 0) continue; // 無限制
    if (!profileValue) return false;                 // 有限制但 profile 未填
    if (!allowed.includes(profileValue)) return false;
  }

  // Phase 7.4: 最低信譽分檢查
  if (typeof criteria.minReputationScore === 'number' && criteria.minReputationScore > 0) {
    const rep = profile.reputationScore ?? 60;
    if (rep < criteria.minReputationScore) return false;
  }

  // Phase G.6: 興趣標籤過濾
  if (Array.isArray(criteria.requiredTagIds) && criteria.requiredTagIds.length > 0) {
    const tags = profileTagIds ?? new Set<string>();
    const mode = criteria.tagMatchMode ?? 'any';
    if (mode === 'all') {
      if (!criteria.requiredTagIds.every((id) => tags.has(id))) return false;
    } else {
      if (!criteria.requiredTagIds.some((id) => tags.has(id))) return false;
    }
  }

  return true;
}
