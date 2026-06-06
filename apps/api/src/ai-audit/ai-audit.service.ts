import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyQuestions, questionOptions } from '../db/schema';
import { ZaiClient } from './zai.client';
import { NotificationsService } from '../notifications/notifications.service';

export interface AuditResult {
  score: number;         // 0-100
  passed: boolean;       // score >= 60
  issues: string[];      // 問題列表
  suggestion: string;    // 改進建議
}

const AUDIT_SYSTEM_PROMPT = `你是問卷品質審核員。請評估問卷的品質，回傳 JSON 格式：
{
  "score": <0-100 整數>,
  "passed": <true 表示通過（score>=60），false 表示不通過>,
  "issues": ["問題1", "問題2"],
  "suggestion": "改進建議"
}

評分維度（各 25 分）：
1. 題目清晰度：題目文字是否明確、無歧義
2. 題型多樣性：是否合理使用不同題型（單選/多選/文字/評分）
3. 中立性：是否避免引導性、誘導性或歧視性題目
4. 整體連貫性：題目是否與問卷主題一致、邏輯通順

注意：
- 題目數量 1-2 題：扣 10 分
- 有明顯個資蒐集意圖且無說明：扣 20 分
- 含政治煽動、色情、仇恨言論：直接 0 分
- 只回傳 JSON，不要其他文字`;

@Injectable()
export class AiAuditService {
  private readonly logger = new Logger(AiAuditService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 純 LLM 評分（不寫 DB、不發通知），供 admin 諮詢用。
   * 不限定 survey status，任何狀態都能審。
   */
  async evaluateSurvey(surveyId: string): Promise<AuditResult> {
    const surveyRows = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey) {
      throw new Error(`Survey ${surveyId} not found`);
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
        : [];

    const surveyText = buildSurveyText(survey, questions, options);

    try {
      return await this.zai.jsonChat<AuditResult>(
        AUDIT_SYSTEM_PROMPT,
        surveyText,
        { temperature: 0.1, model: this.zai.auditModel }, // 問卷 AI 審核：維持高品質模型
      );
    } catch (err) {
      this.logger.error(`問卷 ${surveyId} AI 評分失敗`, err);
      // 諮詢失敗 → 回中性結果，由 admin 自己判斷
      return {
        score: 0,
        passed: false,
        issues: ['AI 服務暫時無法使用，請以人工判斷為主'],
        suggestion: '稍後重試或直接以人工審核',
      };
    }
  }

  /**
   * 非同步審核問卷品質（fire-and-forget，呼叫後立即回傳）
   * 審核完成後自動更新 survey.status → published / rejected
   */
  async auditSurveyAsync(surveyId: string): Promise<void> {
    const surveyRows = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey || survey.status !== 'pending_review') return;

    let result: AuditResult;
    try {
      result = await this.evaluateSurvey(surveyId);
    } catch (err) {
      this.logger.error(`問卷 ${surveyId} AI 審核失敗，自動通過`, err);
      result = { score: 70, passed: true, issues: [], suggestion: '' };
    }

    const newStatus = result.passed ? 'published' : 'rejected';
    const now = new Date();

    const rejectReason = result.passed ? null : (result.issues.join('；') || '不符合品質標準');

    await this.db
      .update(surveys)
      .set({
        status: newStatus,
        aiScore: result.score,
        aiRejectReason: rejectReason,
        publishedAt: result.passed ? now : null,
        updatedAt: now,
      })
      .where(eq(surveys.id, surveyId));

    // 通知問券方
    await this.notifications.create({
      userId: survey.surveyorId,
      type: result.passed ? 'survey_approved' : 'survey_rejected',
      title: result.passed
        ? `問卷「${survey.title}」已審核通過`
        : `問卷「${survey.title}」審核未通過`,
      body: result.passed
        ? `AI 品質評分 ${result.score} 分，問卷已上架，受試者現在可填答。`
        : `原因：${rejectReason}。${result.suggestion ? `建議：${result.suggestion}` : ''}`,
      metadata: { surveyId, aiScore: result.score },
    });

    this.logger.log(
      `問卷 ${surveyId} 審核完成 → ${newStatus}（score: ${result.score}）`,
    );
  }
}

// ─── 組合問卷文字（送給 AI 審核）────────────────────────────────────────────

function buildSurveyText(
  survey: { title: string; description: string | null },
  questions: { id: string; type: string; title: string }[],
  options: { questionId: string; label: string }[],
): string {
  const lines: string[] = [
    `標題：${survey.title}`,
    survey.description ? `說明：${survey.description}` : '',
    '',
    `題目數量：${questions.length}`,
    '',
  ];

  questions.forEach((q, i) => {
    lines.push(`Q${i + 1}（${q.type}）：${q.title}`);
    const qOpts = options.filter((o) => o.questionId === q.id);
    qOpts.forEach((o, j) => lines.push(`  ${j + 1}. ${o.label}`));
  });

  return lines.filter((l) => l !== undefined).join('\n');
}
