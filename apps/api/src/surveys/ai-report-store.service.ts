import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveyAiReports, surveys } from '../db/schema';

/**
 * AI 分析報告持久化(survey_ai_reports)。
 *
 * 報告生成成本高(LLM token + 每日額度),成功生成後 upsert 落 DB;
 * 前端進統計頁先讀已保存報告(不耗額度),「重新生成」才打 LLM 覆寫。
 */
@Injectable()
export class AiReportStoreService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 讀取已保存報告;僅問卷擁有者可讀,否則(或未生成過)回 null */
  async getSaved(
    userId: string,
    surveyId: string,
    reportType: string,
  ): Promise<{ payload: unknown; generatedAt: Date } | null> {
    const [row] = await this.db
      .select({
        payload: surveyAiReports.payload,
        generatedAt: surveyAiReports.generatedAt,
      })
      .from(surveyAiReports)
      .innerJoin(surveys, eq(surveys.id, surveyAiReports.surveyId))
      .where(
        and(
          eq(surveyAiReports.surveyId, surveyId),
          eq(surveyAiReports.reportType, reportType),
          eq(surveys.surveyorId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** upsert:同 survey + reportType 覆寫,並更新 generatedAt */
  async save(surveyId: string, reportType: string, payload: unknown): Promise<void> {
    await this.db
      .insert(surveyAiReports)
      .values({ surveyId, reportType, payload })
      .onConflictDoUpdate({
        target: [surveyAiReports.surveyId, surveyAiReports.reportType],
        set: { payload, generatedAt: new Date() },
      });
  }
}
