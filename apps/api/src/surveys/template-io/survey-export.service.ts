import { Injectable } from '@nestjs/common';
import { SurveysService } from '../surveys.service';
import {
  V1_SCHEMA_TAG,
  type QuanWenSurveyV1,
  type QuanWenSurveyV1Body,
} from './quanwen-survey-v1.schema';

/**
 * Phase 1:把資料庫裡的問卷模板序列化為 QuanWenSurvey v1 JSON。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §3
 *
 * 剝掉的欄位(不可攜):
 *   id / surveyorId / createdAt / updatedAt / publishedAt /
 *   status / aiScore / aiRejectReason / completedCount
 *
 * 保留的欄位(可攜模板):
 *   title / description / type / category / isAnonymous / rewardPoints /
 *   targetCount / aiReviewEnabled / externalUrl / expiresAt /
 *   audienceCriteria / questions[].config / questions[].options[]
 */

const APP_VERSION = '0.1.0'; // 後續可改從 package.json 讀,但避開 require/build 路徑問題

@Injectable()
export class SurveyExportService {
  constructor(private readonly surveys: SurveysService) {}

  async exportAsJson(surveyId: string, surveyorId: string): Promise<QuanWenSurveyV1> {
    // findOneDetailed 已處理:not found → 404、非本人 → 403
    const detail = await this.surveys.findOneDetailed(surveyId, surveyorId);

    const body: QuanWenSurveyV1Body = {
      title: detail.title,
      description: detail.description ?? undefined,
      type: detail.type,
      category: detail.category ?? undefined,
      isAnonymous: detail.isAnonymous,
      rewardPoints: detail.rewardPoints,
      targetCount: detail.targetCount,
      aiReviewEnabled: detail.aiReviewEnabled,
      externalUrl: detail.externalUrl ?? undefined,
      expiresAt: detail.expiresAt ? detail.expiresAt.toISOString() : undefined,
      audienceCriteria: (detail.audienceCriteria as QuanWenSurveyV1Body['audienceCriteria']) ?? undefined,
      questions: detail.questions.map((q, idx) => ({
        type: q.type,
        title: q.title,
        description: q.description ?? undefined,
        sortOrder: q.sortOrder ?? idx,
        isRequired: q.isRequired,
        config: (q.config as Record<string, unknown>) ?? {},
        options: q.options.map((o, oi) => ({
          label: o.label,
          sortOrder: o.sortOrder ?? oi,
        })),
      })),
    };

    return {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: APP_VERSION },
      survey: body,
    };
  }

  /**
   * 產生 Content-Disposition 用的安全檔名。
   * - 限制 ASCII + CJK + 基本符號
   * - 截斷到 60 字
   * - 後綴固定 `.quanwen.v1.json`
   */
  static safeFilename(title: string | null | undefined): string {
    const raw = (title ?? '').trim();
    // 保留中英數、CJK、底線、橫線、空格;其他替換成 _
    const cleaned = raw.replace(/[^\w一-鿿\- ]/g, '_').trim();
    const base = cleaned.slice(0, 60) || 'survey';
    return `${base}.quanwen.v1.json`;
  }
}
