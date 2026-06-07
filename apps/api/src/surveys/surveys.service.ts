import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { eq, desc, inArray } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyQuestions, questionOptions, surveyLogicRules, mutualPairs, surveyLotteryResults } from '../db/schema';
import type { CreateSurveyDto, SurveyQuestionDto } from './dto/create-survey.dto';
import type { UpdateSurveyDto } from './dto/update-survey.dto';
import type { LogicRuleDto } from './dto/logic-rule.dto';
import { ZaiClient } from '../ai-audit/zai.client';
import { AiAuditService } from '../ai-audit/ai-audit.service';
import { WalletService } from '../wallet/wallet.service';
// Phase II.12/14: AI 生成問卷走 registry prompt + Zod parse + normalize
import { SURVEY_DRAFT, SURVEY_QUESTION_REGEN, resolvePrompt } from '../ai-audit/prompts';
import {
  parseAiSurveyDraft,
  normalizeSurveyDraft,
  parseAiQuestion,
  normalizeOneQuestion,
} from '../ai-audit/survey-draft';

// Phase II.12: 原 inline prompt 已移到 prompts.ts 的 SURVEY_DRAFT (v2.0.0)

// ─── QUA-34: Rush delivery tier constants ─────────────────────────────────────
export type DeadlineTier = 'standard' | 'express' | 'urgent' | 'critical';

export const RUSH_TIERS: Record<DeadlineTier, { days: number; multiplier: number }> = {
  standard: { days: 14,  multiplier: 1.00 },
  express:  { days: 7,   multiplier: 1.20 },
  urgent:   { days: 3,   multiplier: 1.50 },
  critical: { days: 1,   multiplier: 1.75 },
};

export function applyRushMultiplier(basePoints: number, tier: DeadlineTier): number {
  return Math.round(basePoints * RUSH_TIERS[tier].multiplier);
}

export function tierExpiresAt(tier: DeadlineTier, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + RUSH_TIERS[tier].days);
  return d;
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
    private readonly aiAudit: AiAuditService,
    private readonly wallet: WalletService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(surveyorId: string, dto: CreateSurveyDto) {
    const tier = (dto.deadlineTier ?? 'standard') as DeadlineTier;
    const rewardMode = dto.type === 'mutual' ? 'fixed' : (dto.rewardMode ?? 'fixed');
    const basePoints = rewardMode === 'lottery' ? 0 : (dto.rewardPoints ?? 0);
    const effectivePoints = applyRushMultiplier(basePoints, tier);
    // If caller explicitly set expiresAt use it; otherwise derive from tier
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : tierExpiresAt(tier);

    let survey = {} as typeof surveys.$inferSelect;
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(surveys)
        .values({
          surveyorId,
          title: dto.title,
          description: dto.description,
          type: dto.type ?? 'standard',
          category: dto.category,
          aiReviewEnabled: dto.aiReviewEnabled ?? true,
          externalUrl: dto.externalUrl,
          estimatedMinutes: dto.estimatedMinutes,
          rewardPoints: effectivePoints,
          baseRewardPoints: basePoints,
          rewardMode,
          lotteryPrize: rewardMode === 'lottery' ? dto.lotteryPrize : null,
          lotteryWinnerCount: rewardMode === 'lottery' ? dto.lotteryWinnerCount : null,
          lotteryDrawMode: rewardMode === 'lottery' ? dto.lotteryDrawMode : null,
          lotteryDrawAt: rewardMode === 'lottery' && dto.lotteryDrawAt ? new Date(dto.lotteryDrawAt) : null,
          lotteryTermsAcceptedAt: rewardMode === 'lottery' && dto.lotteryTermsAccepted ? new Date() : null,
          deadlineTier: tier,
          targetCount: dto.targetCount ?? 100,
          expiresAt,
          isAnonymous: dto.isAnonymous ?? true,
          audienceCriteria: dto.audienceCriteria,
          // QUA-204: Store survey-level question shuffle mode
          questionShuffleMode: dto.questionShuffleMode ?? 'none',
          // QUA-279: 封面圖片
          coverImageUrl: dto.coverImageUrl,
          // 歡迎頁多圖
          welcomeImages: dto.welcomeImages,
          // 樣式主題
          theme: dto.theme,
          // 企業品牌問卷 + 優惠券設定
          isBrandSurvey: dto.isBrandSurvey ?? false,
          couponBrand: dto.couponBrand,
          couponTitle: dto.couponTitle,
          couponCode: dto.couponCode,
          couponExpiresAt: dto.couponExpiresAt ? new Date(dto.couponExpiresAt) : null,
          // QUA-201: 排程發布 / 自動關閉（建立時可一併設定）
          scheduledPublishAt: dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null,
          autoCloseAt: dto.autoCloseAt ? new Date(dto.autoCloseAt) : null,
          autoCloseAfterN: dto.autoCloseAfterN ?? null,
        })
        .returning();

      survey = inserted[0];

      if (dto.questions?.length) {
        await this.replaceQuestionsInTx(tx, survey.id, dto.questions);
      }
    });

    // QUA-196: Insert logic rules after questions are created (need their IDs)
    if (dto.logicRules?.length) {
      await this.db.transaction(async (tx) => {
        // Validate trigger/target question IDs belong to this survey
        const surveyQs = await tx
          .select({ id: surveyQuestions.id })
          .from(surveyQuestions)
          .where(eq(surveyQuestions.surveyId, survey.id));
        const validIds = new Set(surveyQs.map((q) => q.id));

        for (const rule of dto.logicRules!) {
          if (!validIds.has(rule.triggerQuestionId)) {
            throw new BadRequestException(`logicRules: triggerQuestionId ${rule.triggerQuestionId} 不屬於此問卷`);
          }
          if (!validIds.has(rule.targetQuestionId)) {
            throw new BadRequestException(`logicRules: targetQuestionId ${rule.targetQuestionId} 不屬於此問卷`);
          }
        }

        this.validateNoSkipCycles(dto.logicRules!);

        await tx.insert(surveyLogicRules).values(
          dto.logicRules!.map((r) => ({
            surveyId: survey.id,
            triggerQuestionId: r.triggerQuestionId,
            condition: r.condition,
            value: r.value ?? null,
            action: r.action ?? 'show',
            targetQuestionId: r.targetQuestionId,
            sortOrder: r.sortOrder ?? 0,
          })),
        );
      });
    }

    return this.findOneDetailed(survey.id, surveyorId);
  }

  async findMine(surveyorId: string) {
    return this.db
      .select()
      .from(surveys)
      .where(eq(surveys.surveyorId, surveyorId))
      .orderBy(desc(surveys.createdAt));
  }

  /** 複製問卷為新草稿（含題目/選項；不含 skip-logic 與已收回覆） */
  async duplicate(surveyId: string, surveyorId: string) {
    const src = await this.findOneDetailed(surveyId, surveyorId); // 內含擁有者檢查
    if (src.rewardMode === 'lottery') {
      throw new BadRequestException('抽獎問卷不可直接複製，請建立新問卷並重新接受獎品履約條款');
    }
    const dto = {
      title: `${src.title} (副本)`,
      description: src.description ?? undefined,
      type: src.type,
      category: src.category ?? undefined,
      aiReviewEnabled: src.aiReviewEnabled,
      // 用 base（create 會依 deadlineTier 重新套加急倍率）
      rewardPoints: src.baseRewardPoints ?? src.rewardPoints,
      rewardMode: src.rewardMode ?? 'fixed',
      lotteryPrize: src.lotteryPrize ?? undefined,
      lotteryWinnerCount: src.lotteryWinnerCount ?? undefined,
      lotteryDrawMode: src.lotteryDrawMode ?? undefined,
      targetCount: src.targetCount,
      deadlineTier: src.deadlineTier,
      isAnonymous: src.isAnonymous,
      questionShuffleMode: src.questionShuffleMode ?? undefined,
      coverImageUrl: src.coverImageUrl ?? undefined,
      welcomeImages: src.welcomeImages ?? undefined,
      theme: src.theme ?? undefined,
      audienceCriteria: src.audienceCriteria ?? undefined,
      questions: src.questions.map((q) => ({
        type: q.type,
        title: q.title,
        description: q.description ?? undefined,
        imageUrl: q.imageUrl ?? undefined,
        sortOrder: q.sortOrder,
        isRequired: q.isRequired,
        config: (q.config ?? undefined) as Record<string, unknown> | undefined,
        options: (q.options ?? []).map((o) => ({ label: o.label, sortOrder: o.sortOrder })),
      })),
    } as CreateSurveyDto;
    return this.create(surveyorId, dto);
  }

  async findOneDetailed(surveyId: string, requesterId?: string) {
    const rows = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (requesterId && survey.surveyorId !== requesterId) {
      throw new ForbiddenException('無權存取此問卷');
    }

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const questionIds = questions.map((q) => q.id);
    const options =
      questionIds.length > 0
        ? await this.db
            .select()
            .from(questionOptions)
            .where(
              questionIds.length === 1
                ? eq(questionOptions.questionId, questionIds[0])
                : inArray(questionOptions.questionId, questionIds),
            )
            .orderBy(questionOptions.sortOrder)
        : [];

    return {
      ...survey,
      questions: questions.map((q) => ({
        ...q,
        options: options.filter((o) => o.questionId === q.id),
      })),
      // QUA-196: include logic rules for conditional branching
      logicRules: await this.db
        .select()
        .from(surveyLogicRules)
        .where(eq(surveyLogicRules.surveyId, surveyId))
        .orderBy(surveyLogicRules.sortOrder),
    };
  }

  async update(surveyId: string, surveyorId: string, dto: UpdateSurveyDto) {
    const survey = await this.assertOwnerAndDraft(surveyId, surveyorId);

    const { questions, logicRules, ...surveyFields } = dto;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const effectiveRewardMode = surveyFields.rewardMode ?? survey.rewardMode;
    if (effectiveRewardMode === 'lottery') {
      if (survey.type === 'mutual') throw new BadRequestException('互惠問卷不可設定抽獎回饋');
      const lotteryPrize = surveyFields.lotteryPrize ?? survey.lotteryPrize;
      const lotteryWinnerCount = surveyFields.lotteryWinnerCount ?? survey.lotteryWinnerCount;
      const lotteryDrawMode = surveyFields.lotteryDrawMode ?? survey.lotteryDrawMode;
      const lotteryDrawAt = surveyFields.lotteryDrawAt ? new Date(surveyFields.lotteryDrawAt) : survey.lotteryDrawAt;
      const lotteryConfigChanged =
        survey.rewardMode !== 'lottery'
        || (surveyFields.lotteryPrize !== undefined && surveyFields.lotteryPrize !== survey.lotteryPrize)
        || (surveyFields.lotteryWinnerCount !== undefined && surveyFields.lotteryWinnerCount !== survey.lotteryWinnerCount)
        || (surveyFields.lotteryDrawMode !== undefined && surveyFields.lotteryDrawMode !== survey.lotteryDrawMode)
        || (surveyFields.lotteryDrawAt !== undefined && lotteryDrawAt?.getTime() !== survey.lotteryDrawAt?.getTime());
      if (!lotteryPrize) throw new BadRequestException('抽獎回饋必須填寫獎品名稱');
      if (!lotteryWinnerCount) throw new BadRequestException('抽獎回饋必須設定中獎名額');
      if (!lotteryDrawMode) throw new BadRequestException('抽獎回饋必須設定開獎方式');
      if (lotteryDrawMode === 'scheduled' && !lotteryDrawAt) {
        throw new BadRequestException('指定日期開獎必須設定開獎時間');
      }
      if (lotteryDrawMode === 'scheduled' && lotteryDrawAt && lotteryDrawAt.getTime() <= Date.now()) {
        throw new BadRequestException('指定開獎時間必須晚於目前時間');
      }
      if (lotteryConfigChanged && surveyFields.lotteryTermsAccepted !== true) {
        throw new BadRequestException('修改抽獎設定後必須重新接受獎品履約條款');
      }
      if (!survey.lotteryTermsAcceptedAt && surveyFields.lotteryTermsAccepted !== true) {
        throw new BadRequestException('建立抽獎問卷前必須接受獎品履約條款');
      }
    }

    if (surveyFields.title !== undefined) updateData.title = surveyFields.title;
    if (surveyFields.description !== undefined) updateData.description = surveyFields.description;
    if (surveyFields.category !== undefined) updateData.category = surveyFields.category;
    if (surveyFields.aiReviewEnabled !== undefined) updateData.aiReviewEnabled = surveyFields.aiReviewEnabled;
    // 加急倍率：editor 送的 rewardPoints 為基準值，依 deadlineTier 套倍率算實際值（與 create 一致）
    if (surveyFields.deadlineTier !== undefined) {
      const tier = surveyFields.deadlineTier as DeadlineTier;
      const base = surveyFields.rewardPoints ?? 0;
      updateData.deadlineTier = tier;
      updateData.baseRewardPoints = base;
      updateData.rewardPoints = applyRushMultiplier(base, tier);
      if (surveyFields.expiresAt === undefined) updateData.expiresAt = tierExpiresAt(tier);
    } else if (surveyFields.rewardPoints !== undefined) {
      updateData.rewardPoints = surveyFields.rewardPoints;
    }
    if (surveyFields.rewardMode !== undefined) updateData.rewardMode = surveyFields.rewardMode;
    if (surveyFields.lotteryPrize !== undefined) updateData.lotteryPrize = surveyFields.lotteryPrize;
    if (surveyFields.lotteryWinnerCount !== undefined) updateData.lotteryWinnerCount = surveyFields.lotteryWinnerCount;
    if (surveyFields.lotteryDrawMode !== undefined) updateData.lotteryDrawMode = surveyFields.lotteryDrawMode;
    if (surveyFields.lotteryDrawAt !== undefined) updateData.lotteryDrawAt = new Date(surveyFields.lotteryDrawAt);
    if (effectiveRewardMode === 'lottery' && surveyFields.lotteryTermsAccepted) updateData.lotteryTermsAcceptedAt = new Date();
    if (effectiveRewardMode === 'lottery') {
      updateData.rewardPoints = 0;
      updateData.baseRewardPoints = 0;
    }
    if (surveyFields.targetCount !== undefined) updateData.targetCount = surveyFields.targetCount;
    if (surveyFields.expiresAt !== undefined) updateData.expiresAt = new Date(surveyFields.expiresAt);
    if (surveyFields.isAnonymous !== undefined) updateData.isAnonymous = surveyFields.isAnonymous;
    if (surveyFields.audienceCriteria !== undefined) updateData.audienceCriteria = surveyFields.audienceCriteria;
    // QUA-201: 排程發布 / 自動關閉（空字串/缺省 → null 以便清除）
    if (surveyFields.scheduledPublishAt !== undefined)
      updateData.scheduledPublishAt = surveyFields.scheduledPublishAt ? new Date(surveyFields.scheduledPublishAt) : null;
    if (surveyFields.autoCloseAt !== undefined)
      updateData.autoCloseAt = surveyFields.autoCloseAt ? new Date(surveyFields.autoCloseAt) : null;
    if (surveyFields.autoCloseAfterN !== undefined) updateData.autoCloseAfterN = surveyFields.autoCloseAfterN;
    // QUA-204: Allow updating question shuffle mode
    if (surveyFields.questionShuffleMode !== undefined) updateData.questionShuffleMode = surveyFields.questionShuffleMode;
    // QUA-279: Allow updating cover image
    if (surveyFields.coverImageUrl !== undefined) updateData.coverImageUrl = surveyFields.coverImageUrl;
    // 歡迎頁多圖
    if (surveyFields.welcomeImages !== undefined) updateData.welcomeImages = surveyFields.welcomeImages;
    if (surveyFields.theme !== undefined) updateData.theme = surveyFields.theme;

    // Wrap survey update + question replacement in a single transaction:
    // if replaceQuestions fails mid-loop (partial inserts), the survey
    // update rolls back too — prevents inconsistent state.
    await this.db.transaction(async (tx) => {
      await tx.update(surveys).set(updateData).where(eq(surveys.id, surveyId));
      if (questions !== undefined) {
        await this.replaceQuestionsInTx(tx, surveyId, questions);
      }
    });

    // QUA-196: Replace logic rules (after questions are settled so IDs are valid)
    if (logicRules !== undefined) {
      await this.replaceLogicRules(surveyId, logicRules);
    }

    return this.findOneDetailed(surveyId, surveyorId);
  }

  async publish(surveyId: string, surveyorId: string) {
    const survey = await this.assertOwnerAndDraft(surveyId, surveyorId);
    if (survey.rewardMode === 'lottery' && !survey.lotteryTermsAcceptedAt) {
      throw new BadRequestException('抽獎問卷發布前必須接受獎品履約條款');
    }

    // 外部問卷（Google Forms 等）：站內無題目，填答者跳轉至外部頁面。
    // 跳過題目要求、AI 審核與預算鎖定（獎勵由建立者於外部流程履約），直接上架進池。
    if (survey.externalUrl) {
      await this.db
        .update(surveys)
        .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(surveys.id, surveyId));
      return { message: '外部問卷已上架，填答者將跳轉至外部頁面填寫', surveyId };
    }

    const questionCount = await this.db
      .select({ id: surveyQuestions.id })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));

    if (questionCount.length === 0) {
      throw new BadRequestException('問卷至少需要一道題目才能發布');
    }

    // Mutual 問卷：跳過 AI 審核 + 預算鎖定，直接上架並進配對池
    if (survey.type === 'mutual') {
      // 簡易 PII 詞彙過濾 (見 互惠問卷-安全審閱 §3.1 T3)
      await this.assertNoPiiInMutualQuestions(surveyId);

      await this.db
        .update(surveys)
        .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(surveys.id, surveyId));

      await this.db
        .insert(mutualPairs)
        .values({ aUserId: survey.surveyorId, aSurveyId: surveyId, status: 'waiting' })
        .onConflictDoNothing();

      return { message: '互惠問卷已上架，等待配對中', surveyId };
    }

    // Phase C-2: 發問卷方關掉 AI 審核 → 直接上架, 不送 AI 評分
    if (survey.aiReviewEnabled === false) {
      await this.db
        .update(surveys)
        .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(surveys.id, surveyId));

      // 預算仍要鎖（付費取樣）
      this.wallet.lockSurveyBudget(survey.surveyorId, surveyId).catch((err) =>
        this.logger.error(`預算鎖定失敗 surveyId=${surveyId}`, err),
      );

      return { message: '問卷已直接上架（未開啟 AI 審核）', surveyId };
    }

    // 2026-06-06 改版：發布即上架，不再卡 pending_review 等 AI 過審。
    // AI 審核降級為「發布後品質掃描」（advisory）：低分只通知建立者改善，不擋發布、不自動下架。
    await this.db
      .update(surveys)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));

    // Fire-and-forget 發布後 AI 品質掃描（不阻塞回應、不影響上架狀態）
    this.aiAudit.auditSurveyAsync(surveyId).catch((err) =>
      this.logger.error(`AI 品質掃描 fire-and-forget 錯誤 surveyId=${surveyId}`, err),
    );

    // Fire-and-forget 預算鎖定
    this.wallet.lockSurveyBudget(survey.surveyorId, surveyId).catch((err) =>
      this.logger.error(`預算鎖定失敗 surveyId=${surveyId}`, err),
    );

    return { message: '問卷已上架，AI 品質掃描將於稍後完成', surveyId };
  }

  async remove(surveyId: string, surveyorId: string) {
    const survey = await this.assertOwnerAndDraft(surveyId, surveyorId);
    const [lotteryResult] = await this.db
      .select({ id: surveyLotteryResults.id })
      .from(surveyLotteryResults)
      .where(eq(surveyLotteryResults.surveyId, surveyId))
      .limit(1);
    if (survey.lotteryDrawnAt || lotteryResult) {
      throw new BadRequestException('抽獎已開獎，平台須保留履約與稽核紀錄，不能刪除');
    }
    await this.db.delete(surveys).where(eq(surveys.id, surveyId));
    return { message: '草稿已刪除' };
  }

  // ─── AI Draft ─────────────────────────────────────────────────────────────

  /**
   * Phase II.12: AI 一鍵生成問卷草稿。
   * 使用者給「主題 + 目的 + 受眾」→ LLM 生 → Zod parse（救型別）→ normalize
   * （修結構：選項不足降級、rating 補 maxRating、去重、截斷…）→ 回乾淨草稿。
   *
   * 回傳的 questions 結構直接相容 CreateSurveySchema，前端可一鍵存成 draft。
   * notes 是 normalize 過程的修正提醒，給前端顯示「AI 草稿已自動調整 X」。
   */
  async generateAiDraft(dto: {
    topic: string;
    questionCount: number;
    language: string;
    targetAudience?: string;
    purpose?: string;
    preferredTypes?: Array<'single_choice' | 'multiple_choice' | 'text' | 'rating'>;
    // Phase II.15: 逐題型指定題數（含學術量表變體）
    typeSpecs?: Array<{
      type:
        | 'single_choice'
        | 'multiple_choice'
        | 'text'
        | 'rating'
        | 'scale_agreement'
        | 'scale_frequency';
      count: number;
    }>;
    // Phase II.14: 換個角度再生 — 避開前一版題目 + 換切入角度
    avoidTitles?: string[];
  }): Promise<{
    title: string;
    description?: string;
    questions: SurveyQuestionDto[];
    notes: string[];
  }> {
    const TYPE_LABELS: Record<string, string> = {
      single_choice: '單選',
      multiple_choice: '多選',
      text: '開放問答',
      rating: '評分',
      scale_agreement: '同意度量表(非常不同意→非常同意 0~5)',
      scale_frequency: '頻率量表(從來沒有→總是如此 0~5)',
    };

    // Phase II.15: 逐型題數優先；沒給 typeSpecs 時才回退到舊的 preferredTypes
    const validSpecs = (dto.typeSpecs ?? []).filter((s) => s.count > 0);
    const specsTotal = validSpecs.reduce((sum, s) => sum + s.count, 0);
    const specsLine =
      validSpecs.length > 0
        ? `各題型題數（務必精確照數量產生，總題數 = ${specsTotal}）：\n` +
          validSpecs.map((s) => `  - ${TYPE_LABELS[s.type] ?? s.type}：${s.count} 題`).join('\n')
        : '';
    const preferredLine =
      validSpecs.length === 0 && dto.preferredTypes && dto.preferredTypes.length > 0
        ? `偏好題型（請優先使用，其餘酌量）：${dto.preferredTypes.map((t) => TYPE_LABELS[t] ?? t).join('、')}`
        : '';

    // 有 typeSpecs 用其加總；否則用 questionCount。上限 30。
    const totalQuestions = Math.min(validSpecs.length > 0 ? specsTotal : dto.questionCount, 30);

    const avoidLine =
      dto.avoidTitles && dto.avoidTitles.length > 0
        ? `這是「換個角度再生」：請用不同的切入角度與問法，避免與以下上一版題目重複：\n${dto.avoidTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '';

    const userPrompt = [
      `主題：${dto.topic}`,
      dto.purpose ? `目的：${dto.purpose}` : '',
      specsLine ? specsLine : `題目數量：${totalQuestions} 題`,
      `語言：${dto.language}`,
      dto.targetAudience ? `目標受眾：${dto.targetAudience}` : '',
      preferredLine,
      avoidLine,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = resolvePrompt(SURVEY_DRAFT);
    const raw = await this.zai.jsonChat<unknown>(prompt.system, userPrompt, {
      temperature: 0.7,
      promptKey: prompt.key,
      promptVersion: prompt.version,
    });

    const parsed = parseAiSurveyDraft(raw);
    const normalized = normalizeSurveyDraft(parsed, { maxQuestions: totalQuestions });

    // normalized.questions 已是 {type,title,sortOrder,isRequired,config?,options?}
    // 直接當 SurveyQuestionDto[] 回（options 內含 sortOrder）
    return {
      title: normalized.title,
      description: normalized.description,
      questions: normalized.questions as unknown as SurveyQuestionDto[],
      notes: normalized.notes,
    };
  }

  /**
   * Phase II.14: AI 單題重生。
   * 給問卷上下文 + 要重生的題 + 調整方向 → AI 回一題新的（normalize 後）。
   * 用於前端「🔄 換一題」：保留其他題，只替換這一題。
   */
  async regenerateQuestion(dto: {
    topic: string;
    purpose?: string;
    currentTitle: string;
    otherTitles: string[];
    direction?: string;
    preferredType?: 'single_choice' | 'multiple_choice' | 'text' | 'rating';
  }): Promise<{ question: SurveyQuestionDto; notes: string[] }> {
    const TYPE_LABELS: Record<string, string> = {
      single_choice: '單選',
      multiple_choice: '多選',
      text: '開放問答',
      rating: '評分',
    };
    const userPrompt = [
      `問卷主題：${dto.topic}`,
      dto.purpose ? `問卷目的：${dto.purpose}` : '',
      `要重新生成的題目：${dto.currentTitle}`,
      dto.otherTitles.length > 0
        ? `其他現有題目（不可重複）：\n${dto.otherTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
        : '',
      dto.direction ? `調整方向：${dto.direction}` : '請換個問法或角度，產生一個更好的版本',
      dto.preferredType ? `指定題型：${TYPE_LABELS[dto.preferredType] ?? dto.preferredType}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = resolvePrompt(SURVEY_QUESTION_REGEN);
    const raw = await this.zai.jsonChat<unknown>(prompt.system, userPrompt, {
      temperature: 0.8, // 重生要更多變化
      promptKey: prompt.key,
      promptVersion: prompt.version,
    });

    const parsed = parseAiQuestion(raw);
    const { question, notes } = normalizeOneQuestion(parsed, 0);
    if (!question) {
      // AI 回了無效題（空 title 等）→ 回退一個最簡單的開放題佔位，附 note
      return {
        question: {
          type: 'text',
          title: dto.currentTitle,
          sortOrder: 0,
          isRequired: true,
        } as unknown as SurveyQuestionDto,
        notes: ['AI 重生結果無效，已保留原題目文字，請手動調整或再試一次'],
      };
    }
    return { question: question as unknown as SurveyQuestionDto, notes };
  }

  /**
   * AI 給現有問卷的改進建議（不寫 DB，僅諮詢）
   */
  async aiImprove(surveyId: string, surveyorId: string) {
    const survey = await this.findOneDetailed(surveyId, surveyorId);

    const lines: string[] = [
      `問卷標題：${survey.title}`,
      survey.description ? `說明：${survey.description}` : '',
      `題目數量：${survey.questions.length}`,
      '',
      '現有題目：',
    ];
    survey.questions.forEach((q, i) => {
      lines.push(`Q${i + 1}（${q.type}）：${q.title}`);
      if (q.options.length > 0) {
        q.options.forEach((o, j) => lines.push(`    ${j + 1}. ${o.label}`));
      }
    });

    const prompt = [
      ...lines,
      '',
      '請給出問卷改進建議。回傳 JSON：',
      '{',
      '  "overallScore": <0-100 整數>,',
      '  "strengths": ["優點 1", "優點 2"],',
      '  "weaknesses": [{ "questionIndex": <Q 序號, 1-based or 0 表整體>, "issue": "問題描述", "suggestion": "如何改" }],',
      '  "missingTypes": ["建議補上的題型/主題"],',
      '  "wordingTips": ["更好的表達建議"]',
      '}',
      '',
      '判斷準則：',
      '- 是否有引導性、雙重否定、模糊不清的題目',
      '- 題型多樣性（單選/多選/評分/開放各佔比）',
      '- 順序：簡單到複雜，敏感題放後',
      '- 是否漏掉重要層面（背景資料、整體滿意度等）',
    ].join('\n');

    return this.zai.jsonChat<{
      overallScore: number;
      strengths: string[];
      weaknesses: Array<{ questionIndex: number; issue: string; suggestion: string }>;
      missingTypes: string[];
      wordingTips: string[];
    }>(
      '你是專業問卷設計顧問。給具體可行的改進建議，繁體中文，禁編造。',
      prompt,
      { temperature: 0.4 },
    );
  }

  // ─── Phase 4: 設計階段反作弊輔助 ─────────────────────────────────────────

  /**
   * AI 建議插入注意力檢核題（基於 prompts/attention-check.md）
   * 不寫 DB；前端取得後讓問券方手動勾選要採用的題
   */
  async suggestAttentionChecks(surveyId: string, surveyorId: string) {
    const survey = await this.findOneDetailed(surveyId, surveyorId);

    if (survey.questions.length < 5) {
      return {
        checks: [],
        note: '題目少於 5 題，不建議插入注意力檢核題（避免突兀）',
      };
    }

    const typeDistribution = survey.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.type] = (acc[q.type] ?? 0) + 1;
      return acc;
    }, {});

    const prompt = [
      '=== 原問卷資訊 ===',
      `標題：${survey.title}`,
      `題數：${survey.questions.length}`,
      `題型分布：${Object.entries(typeDistribution).map(([t, n]) => `${n} ${t}`).join(' / ')}`,
      '',
      '=== 現有題目（節選 6 題給你抓風格） ===',
      survey.questions.slice(0, 6).map((q, i) => `Q${i + 1}（${q.type}）：${q.title}`).join('\n'),
      '',
      `請為這份問卷生成 ${survey.questions.length >= 20 ? '2' : '1-2'} 題注意力檢核題，並建議插入位置（題號從 1 開始，例如 insertAfterIndex=5 表示插在 Q5 之後）。`,
      '',
      '回覆 JSON：',
      '{',
      '  "checks": [',
      '    {',
      '      "insertAfterIndex": <整數 1 ~ ' + survey.questions.length + '>,',
      '      "question": {',
      '        "type": "single_choice" | "text",',
      '        "title": "題目文字",',
      '        "options": [{"label": "選項 1"}],   // single_choice 才需要',
      '        "correctValue": "正解（option label 或 text 內容）",',
      '        "kind": "instruction|common_sense|arithmetic|situational",',
      '        "reasoning": "為何選這位置 + 為何選這類型"',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    return this.zai.jsonChat<{
      checks: Array<{
        insertAfterIndex: number;
        question: {
          type: 'single_choice' | 'text';
          title: string;
          options?: Array<{ label: string }>;
          correctValue: string;
          kind: 'instruction' | 'common_sense' | 'arithmetic' | 'situational';
          reasoning: string;
        };
      }>;
    }>(
      // v2（2026-06-06）：偏向常識/情境推理型 — 傳統「請選第三個選項」指令題與反向題
      // 對腳本掛 LLM 代填毫無攔截力（LLM 一樣讀得懂指令）。優先出需要把「本問卷
      // 主題情境 + 生活常識」結合起來推理的題目，並讓正解依附於前後題脈絡。
      '你是台灣資深問卷設計顧問。你的任務是為一份問卷生成「注意力檢核題」，用來偵測敷衍亂填與腳本/AI 代填。'
        + '優先順序：(1) situational 情境推理題 — 把題目綁定本問卷的具體主題情境（例如延續前一題的情境設定），'
        + '讓沒讀過前文的代填者答錯；(2) common_sense 常識推理題 — 需要台灣在地生活常識的判斷，'
        + '答案對認真的人顯而易見、對亂點的人是 1/N 機率；(3) arithmetic 簡單計算。'
        + '避免「請選擇第 N 個選項」這類純指令題（機器人也讀得懂指令，攔截力最低）。'
        + '檢核題應該：認真讀就答得對、風格融入原問卷、不要刁難真人。'
        + 'correctValue 必須與其中一個 option label 完全一致。繁體中文，JSON 回覆。',
      prompt,
      { temperature: 0.4 },
    );
  }

  /**
   * 上架前 AI 預審（基於 prompts/pre-review.md）
   * 不寫 DB，純諮詢。檢查紅線、警告、加分項
   */
  async preReview(surveyId: string, surveyorId: string) {
    const survey = await this.findOneDetailed(surveyId, surveyorId);

    // 偵測本地反作弊機制（簡易啟發式：題目標題含「請選」「請輸入」等指令）
    const hasInstructionCheck = survey.questions.some((q) =>
      /請(於此題)?選擇|請輸入.*[0-9]|請填寫「/.test(q.title),
    );
    const ratingCount = survey.questions.filter((q) => q.type === 'rating').length;
    const textCount = survey.questions.filter((q) => q.type === 'text').length;
    const openRatio = survey.questions.length > 0 ? textCount / survey.questions.length : 0;

    const questionsJson = JSON.stringify(
      survey.questions.map((q, i) => ({
        index: i + 1,
        type: q.type,
        title: q.title,
        optionCount: q.options.length,
      })),
      null,
      2,
    );

    const prompt = [
      '=== 問卷資訊 ===',
      `標題：${survey.title}`,
      `說明：${survey.description || '（無）'}`,
      `題數：${survey.questions.length}`,
      `量表題數：${ratingCount}`,
      `開放題比例：${(openRatio * 100).toFixed(0)}%`,
      `是否含本地偵測到的注意力檢核：${hasInstructionCheck ? '是' : '否'}`,
      '',
      '=== 題目列表 ===',
      questionsJson,
      '',
      '請以 JSON 回覆預審結果：',
      '{',
      '  "decision": "approve" | "approve_with_changes" | "reject",',
      '  "score": <0-100>,',
      '  "redFlags": [',
      '    { "severity": "high"|"medium"|"low", "issue": "...", "questionIndex": <int|null>, "suggestedFix": "..." }',
      '  ],',
      '  "warnings": ["..."],',
      '  "compliments": ["..."],',
      '  "estimatedCompletionRate": <0-100>,',
      '  "hasAntiCheatMechanism": <boolean>,',
      '  "summaryForSurveyor": "給問券方看的友善說明（繁體中文，具體可行）"',
      '}',
      '',
      '【一級紅線】政治、宗教、色情、醫療診斷、敏感個資（身分證/銀行密碼/健康紀錄）、賭博毒品武器',
      '【二級警告】誘導性題目、雙重否定、開放題 > 30%、量表選項不對稱、無研究目的、題目模糊',
      '【加分項】題目分組清楚、有資料使用聲明、含注意力檢核',
    ].join('\n');

    return this.zai.jsonChat<{
      decision: 'approve' | 'approve_with_changes' | 'reject';
      score: number;
      redFlags: Array<{
        severity: 'high' | 'medium' | 'low';
        issue: string;
        questionIndex: number | null;
        suggestedFix: string;
      }>;
      warnings: string[];
      compliments: string[];
      estimatedCompletionRate: number;
      hasAntiCheatMechanism: boolean;
      summaryForSurveyor: string;
    }>(
      '你是台灣的問卷上架審核員（pre-review 階段），負責在問券方送審前先提醒問題。'
        + '要嚴謹但友善：明確指出問題、給具體修法。繁體中文 JSON 回覆。temperature 低。',
      prompt,
      { temperature: 0.2 },
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Phase B 安全防護:檢查 mutual 問卷的題目不要套取 PII。
   * 看 互惠問卷-安全審閱.md §3.1 T3。
   */
  private async assertNoPiiInMutualQuestions(surveyId: string): Promise<void> {
    const qs = await this.db
      .select({ id: surveyQuestions.id, title: surveyQuestions.title, description: surveyQuestions.description })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));

    // 中英文 PII 索取的常見字眼
    const PII_PATTERNS = [
      /身分證/, /身份證/, /national\s*id/i,
      /銀行帳號/, /銀行卡/, /bank\s*account/i, /account\s*number/i,
      /信用卡/, /credit\s*card/i, /\bccv\b/i, /\bcvv\b/i,
      /密碼/, /\bpassword\b/i, /\bpasswd\b/i,
      /護照號/, /passport/i,
      /健保卡/, /駕照/,
    ];

    for (const q of qs) {
      const text = `${q.title}\n${q.description ?? ''}`;
      const hit = PII_PATTERNS.find((re) => re.test(text));
      if (hit) {
        throw new BadRequestException(
          `互惠問卷不可索取個資 (偵測到「${hit}」相關關鍵字)。請改 standard 付費取樣模式並走 KYC 流程。`,
        );
      }
    }
  }

  private async assertOwnerAndDraft(surveyId: string, surveyorId: string) {
    const rows = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        status: surveys.status,
        type: surveys.type,
        externalUrl: surveys.externalUrl,
        aiReviewEnabled: surveys.aiReviewEnabled,
        rewardMode: surveys.rewardMode,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
        lotteryTermsAcceptedAt: surveys.lotteryTermsAcceptedAt,
        lotteryPrize: surveys.lotteryPrize,
        lotteryWinnerCount: surveys.lotteryWinnerCount,
        lotteryDrawMode: surveys.lotteryDrawMode,
        lotteryDrawAt: surveys.lotteryDrawAt,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (survey.surveyorId !== surveyorId) throw new ForbiddenException('無權操作此問卷');
    if (!['draft', 'rejected'].includes(survey.status)) {
      throw new BadRequestException('只能編輯草稿或被退回的問卷');
    }
    return survey;
  }

  // ─── QUA-196: Logic Rules Helpers ──────────────────────────────────────────

  /**
   * Replace all logic rules for a survey (delete + re-insert in a tx).
   * Validates that trigger/target question IDs belong to this survey,
   * and checks for infinite loops in skip chains.
   */
  private async replaceLogicRules(
    surveyId: string,
    rules: LogicRuleDto[],
  ) {
    // Fetch current question IDs for this survey
    const surveyQs = await this.db
      .select({ id: surveyQuestions.id })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));
    const validIds = new Set(surveyQs.map((q) => q.id));

    // Validate all trigger/target IDs
    for (const rule of rules) {
      if (!validIds.has(rule.triggerQuestionId)) {
        throw new BadRequestException(`logicRules: triggerQuestionId ${rule.triggerQuestionId} 不屬於此問卷`);
      }
      if (!validIds.has(rule.targetQuestionId)) {
        throw new BadRequestException(`logicRules: targetQuestionId ${rule.targetQuestionId} 不屬於此問卷`);
      }
    }

    // Check for infinite loops in skip chains
    this.validateNoSkipCycles(rules);

    await this.db.transaction(async (tx) => {
      // Delete existing rules
      await tx
        .delete(surveyLogicRules)
        .where(eq(surveyLogicRules.surveyId, surveyId));

      // Insert new rules
      if (rules.length > 0) {
        await tx.insert(surveyLogicRules).values(
          rules.map((r) => ({
            surveyId,
            triggerQuestionId: r.triggerQuestionId,
            condition: r.condition,
            value: r.value ?? null,
            action: r.action ?? 'show',
            targetQuestionId: r.targetQuestionId,
            sortOrder: r.sortOrder ?? 0,
          })),
        );
      }
    });
  }

  /**
   * Validate that skip rules don't create cycles (infinite loops).
   * A cycle exists if following skip chains from any question leads back to itself.
   */
  private validateNoSkipCycles(
    rules: Array<{ triggerQuestionId: string; action?: string; targetQuestionId: string }>,
  ) {
    // Build multi-edge adjacency list (a question may have multiple skip rules with different conditions)
    const adj = new Map<string, Set<string>>();
    for (const rule of rules) {
      if (rule.action !== 'skip') continue;
      const targets = adj.get(rule.triggerQuestionId) ?? new Set<string>();
      targets.add(rule.targetQuestionId);
      adj.set(rule.triggerQuestionId, targets);
    }

    // DFS cycle detection with explicit recursion stack (iterative to avoid stack overflow on large graphs)
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();

    const dfs = (start: string): string[] | null => {
      const stack: Array<{ node: string; iter: Iterator<string> }> = [];
      const path: string[] = [];

      color.set(start, GRAY);
      path.push(start);
      stack.push({ node: start, iter: (adj.get(start) ?? new Set()).values() });

      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!;
        const next = frame.iter.next();

        if (next.done) {
          color.set(frame.node, BLACK);
          stack.pop();
          path.pop();
        } else {
          const neighbor = next.value;
          const c = color.get(neighbor) ?? WHITE;
          if (c === GRAY) {
            // Found cycle — reconstruct path from where we re-entered
            const cycleStart = path.indexOf(neighbor);
            return [...path.slice(cycleStart), neighbor];
          }
          if (c === WHITE) {
            color.set(neighbor, GRAY);
            path.push(neighbor);
            stack.push({ node: neighbor, iter: (adj.get(neighbor) ?? new Set()).values() });
          }
        }
      }
      return null;
    };

    for (const node of adj.keys()) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        const cycle = dfs(node);
        if (cycle) {
          throw new BadRequestException(
            `logicRules: 偵測到無限跳轉迴圈 (${cycle.join(' → ')})，請檢查 skip 規則`,
          );
        }
      }
    }
  }

  /**
   * Evaluate logic rules for a survey response.
   * Returns the set of question IDs that should be VISIBLE to the respondent,
   * based on the answers they've provided so far.
   *
   * Logic:
   *  - By default, all questions are visible.
   *  - 'show' rules: target is HIDDEN unless trigger condition is met.
   *  - 'hide' rules: target is VISIBLE unless trigger condition is met.
   *  - 'skip' rules: if trigger condition is met, jump to target (hide everything between).
   */
  async evaluateLogicRules(
    surveyId: string,
    answers: Record<string, { textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>,
  ): Promise<{ visibleQuestionIds: Set<string>; skippedQuestionIds: Set<string> }> {
    const rules = await this.db
      .select()
      .from(surveyLogicRules)
      .where(eq(surveyLogicRules.surveyId, surveyId))
      .orderBy(surveyLogicRules.sortOrder);

    if (rules.length === 0) {
      // No rules → all questions visible
      const allQs = await this.db
        .select({ id: surveyQuestions.id })
        .from(surveyQuestions)
        .where(eq(surveyQuestions.surveyId, surveyId));
      return {
        visibleQuestionIds: new Set(allQs.map((q) => q.id)),
        skippedQuestionIds: new Set(),
      };
    }

    // Get all question IDs for this survey, sorted by sortOrder
    const allQs = await this.db
      .select({ id: surveyQuestions.id, sortOrder: surveyQuestions.sortOrder })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const allQuestionIds = allQs.map((q) => q.id);
    const visible = new Set(allQuestionIds);
    const skipped = new Set<string>();

    // Group rules by action type
    const showRules = rules.filter((r) => r.action === 'show');
    const hideRules = rules.filter((r) => r.action === 'hide');
    const skipRules = rules.filter((r) => r.action === 'skip');

    // For 'show' rules: target starts HIDDEN, becomes visible when condition is met
    for (const rule of showRules) {
      if (!this.evaluateCondition(rule.triggerQuestionId, rule.condition, rule.value, answers)) {
        visible.delete(rule.targetQuestionId);
      }
    }

    // For 'hide' rules: target starts VISIBLE, becomes hidden when condition is met
    for (const rule of hideRules) {
      if (this.evaluateCondition(rule.triggerQuestionId, rule.condition, rule.value, answers)) {
        visible.delete(rule.targetQuestionId);
      }
    }

    // For 'skip' rules: if condition met, mark questions between trigger and target as skipped
    for (const rule of skipRules) {
      if (this.evaluateCondition(rule.triggerQuestionId, rule.condition, rule.value, answers)) {
        const triggerIdx = allQuestionIds.indexOf(rule.triggerQuestionId);
        const targetIdx = allQuestionIds.indexOf(rule.targetQuestionId);
        if (triggerIdx !== -1 && targetIdx !== -1) {
          const [from, to] = triggerIdx < targetIdx
            ? [triggerIdx + 1, targetIdx - 1]
            : [targetIdx + 1, triggerIdx - 1];
          for (let i = from; i <= to; i++) {
            const qId = allQuestionIds[i];
            visible.delete(qId);
            skipped.add(qId);
          }
        }
      }
    }

    return { visibleQuestionIds: visible, skippedQuestionIds: skipped };
  }

  /**
   * Evaluate a single condition against the given answers.
   */
  private evaluateCondition(
    triggerQuestionId: string,
    condition: string,
    value: string | null,
    answers: Record<string, { textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>,
  ): boolean {
    const answer = answers[triggerQuestionId];

    switch (condition) {
      case 'is_empty':
        return !answer || (
          (answer.textAnswer === undefined || answer.textAnswer === '') &&
          (!answer.selectedOptionIds || answer.selectedOptionIds.length === 0) &&
          (answer.ratingValue === undefined || answer.ratingValue === null)
        );

      case 'is_not_empty':
        return !!answer && (
          (answer.textAnswer !== undefined && answer.textAnswer !== '') ||
          (answer.selectedOptionIds && answer.selectedOptionIds.length > 0) ||
          (answer.ratingValue !== undefined && answer.ratingValue !== null)
        );

      default:
        break;
    }

    // All other conditions require an answer
    if (!answer) return false;

    const valueStr = value ?? '';

    // Text-based comparison
    const textVal = answer.textAnswer ?? '';

    // Option-based comparison
    const options = answer.selectedOptionIds ?? [];

    // Numeric comparison (for rating)
    const numVal = answer.ratingValue;
    const numTarget = parseFloat(valueStr);

    switch (condition) {
      case 'eq':
        return textVal === valueStr || options.includes(valueStr) || (numVal !== undefined && numVal === numTarget);

      case 'neq':
        return textVal !== valueStr && !options.includes(valueStr) && (numVal === undefined || numVal !== numTarget);

      case 'gt':
        return numVal !== undefined && !isNaN(numTarget) && numVal > numTarget;

      case 'gte':
        return numVal !== undefined && !isNaN(numTarget) && numVal >= numTarget;

      case 'lt':
        return numVal !== undefined && !isNaN(numTarget) && numVal < numTarget;

      case 'lte':
        return numVal !== undefined && !isNaN(numTarget) && numVal <= numTarget;

      case 'contains':
        return textVal.includes(valueStr) || options.some((o) => o.includes(valueStr));

      case 'not_contains':
        return !textVal.includes(valueStr) && !options.some((o) => o.includes(valueStr));

      default:
        return false;
    }
  }

  private async replaceQuestions(surveyId: string, questionDtos: SurveyQuestionDto[]) {
    await this.db.transaction(async (tx) => {
      await this.replaceQuestionsInTx(tx, surveyId, questionDtos);
    });
  }

  private async replaceQuestionsInTx(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    surveyId: string,
    questionDtos: SurveyQuestionDto[],
  ) {
    await tx
      .delete(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));

    for (const qDto of questionDtos) {
      const inserted = await tx
        .insert(surveyQuestions)
        .values({
          surveyId,
          type: qDto.type,
          title: qDto.title,
          description: qDto.description,
          sortOrder: qDto.sortOrder ?? 0,
          isRequired: qDto.isRequired ?? true,
          // QUA-279: 題目圖片
          imageUrl: qDto.imageUrl,
          config: qDto.config,
        })
        .returning({ id: surveyQuestions.id });

      const questionId = inserted[0].id;

      if (qDto.options?.length) {
        await tx.insert(questionOptions).values(
          qDto.options.map((o, i) => ({
            questionId,
            label: o.label,
            sortOrder: o.sortOrder ?? i,
          })),
        );
      }
    }
  }
}
