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
import { surveys, surveyQuestions, questionOptions, mutualPairs } from '../db/schema';
import type { CreateSurveyDto, SurveyQuestionDto } from './dto/create-survey.dto';
import type { UpdateSurveyDto } from './dto/update-survey.dto';
import { ZaiClient } from '../ai-audit/zai.client';
import { AiAuditService } from '../ai-audit/ai-audit.service';
import { WalletService } from '../wallet/wallet.service';
// Phase II.12: AI 生成問卷走 registry prompt + Zod parse + normalize
import { SURVEY_DRAFT, resolvePrompt } from '../ai-audit/prompts';
import { parseAiSurveyDraft, normalizeSurveyDraft } from '../ai-audit/survey-draft';

// Phase II.12: 原 inline prompt 已移到 prompts.ts 的 SURVEY_DRAFT (v2.0.0)

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
    const inserted = await this.db
      .insert(surveys)
      .values({
        surveyorId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? 'standard',
        category: dto.category,
        aiReviewEnabled: dto.aiReviewEnabled ?? true,
        externalUrl: dto.externalUrl,
        rewardPoints: dto.rewardPoints ?? 0,
        targetCount: dto.targetCount ?? 100,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isAnonymous: dto.isAnonymous ?? true,
        audienceCriteria: dto.audienceCriteria,
      })
      .returning();

    const survey = inserted[0];

    if (dto.questions?.length) {
      await this.replaceQuestions(survey.id, dto.questions);
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
    };
  }

  async update(surveyId: string, surveyorId: string, dto: UpdateSurveyDto) {
    await this.assertOwnerAndDraft(surveyId, surveyorId);

    const { questions, ...surveyFields } = dto;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (surveyFields.title !== undefined) updateData.title = surveyFields.title;
    if (surveyFields.description !== undefined) updateData.description = surveyFields.description;
    if (surveyFields.category !== undefined) updateData.category = surveyFields.category;
    if (surveyFields.aiReviewEnabled !== undefined) updateData.aiReviewEnabled = surveyFields.aiReviewEnabled;
    if (surveyFields.rewardPoints !== undefined) updateData.rewardPoints = surveyFields.rewardPoints;
    if (surveyFields.targetCount !== undefined) updateData.targetCount = surveyFields.targetCount;
    if (surveyFields.expiresAt !== undefined) updateData.expiresAt = new Date(surveyFields.expiresAt);
    if (surveyFields.isAnonymous !== undefined) updateData.isAnonymous = surveyFields.isAnonymous;
    if (surveyFields.audienceCriteria !== undefined) updateData.audienceCriteria = surveyFields.audienceCriteria;

    await this.db.update(surveys).set(updateData).where(eq(surveys.id, surveyId));

    if (questions !== undefined) {
      await this.replaceQuestions(surveyId, questions);
    }

    return this.findOneDetailed(surveyId, surveyorId);
  }

  async publish(surveyId: string, surveyorId: string) {
    const survey = await this.assertOwnerAndDraft(surveyId, surveyorId);

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

    await this.db
      .update(surveys)
      .set({ status: 'pending_review', updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));

    // Fire-and-forget AI 審核（不阻塞回應）
    this.aiAudit.auditSurveyAsync(surveyId).catch((err) =>
      this.logger.error(`AI 審核 fire-and-forget 錯誤 surveyId=${surveyId}`, err),
    );

    // Fire-and-forget 預算鎖定
    this.wallet.lockSurveyBudget(survey.surveyorId, surveyId).catch((err) =>
      this.logger.error(`預算鎖定失敗 surveyId=${surveyId}`, err),
    );

    return { message: '問卷已送出審核，AI 將在稍後完成評分', surveyId };
  }

  async remove(surveyId: string, surveyorId: string) {
    await this.assertOwnerAndDraft(surveyId, surveyorId);
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
    };
    const preferredLine =
      dto.preferredTypes && dto.preferredTypes.length > 0
        ? `偏好題型（請優先使用，其餘酌量）：${dto.preferredTypes.map((t) => TYPE_LABELS[t] ?? t).join('、')}`
        : '';

    const userPrompt = [
      `主題：${dto.topic}`,
      dto.purpose ? `目的：${dto.purpose}` : '',
      `題目數量：${dto.questionCount} 題`,
      `語言：${dto.language}`,
      dto.targetAudience ? `目標受眾：${dto.targetAudience}` : '',
      preferredLine,
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
    const normalized = normalizeSurveyDraft(parsed, { maxQuestions: dto.questionCount });

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
      '        "kind": "instruction|common_sense|arithmetic",',
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
          kind: 'instruction' | 'common_sense' | 'arithmetic';
          reasoning: string;
        };
      }>;
    }>(
      '你是台灣資深問卷設計顧問。你的任務是為一份問卷生成「注意力檢核題」，用來偵測受試者是否認真填答。'
        + '檢核題應該：認真讀就答得對、風格融入原問卷、不要太難或太簡單。'
        + '量表型問卷適合指令型，開放題多的適合計算型。繁體中文，JSON 回覆。',
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
      .select({ id: surveys.id, surveyorId: surveys.surveyorId, status: surveys.status, type: surveys.type, aiReviewEnabled: surveys.aiReviewEnabled })
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

  private async replaceQuestions(surveyId: string, questionDtos: SurveyQuestionDto[]) {
    await this.db
      .delete(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId));

    for (const qDto of questionDtos) {
      const inserted = await this.db
        .insert(surveyQuestions)
        .values({
          surveyId,
          type: qDto.type,
          title: qDto.title,
          description: qDto.description,
          sortOrder: qDto.sortOrder ?? 0,
          isRequired: qDto.isRequired ?? true,
          config: qDto.config,
        })
        .returning({ id: surveyQuestions.id });

      const questionId = inserted[0].id;

      if (qDto.options?.length) {
        await this.db.insert(questionOptions).values(
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
