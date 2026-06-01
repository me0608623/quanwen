import { z } from 'zod';
import {
  SurveyQuestionSchema,
  AudienceCriteriaSchema,
  SURVEY_CATEGORIES,
} from '../dto/create-survey.dto';

/**
 * QuanWenSurvey v1 — 問卷模板匯入/匯出的可攜格式。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md
 * OpenAPI:12-技術交付/02-API/openapi.yaml `#/components/schemas/QuanWenSurveyV1`
 *
 * 核心約定:
 * - 只含模板層欄位;**不**含個資(surveyorId)、執行期狀態(aiScore/completedCount/status)
 * - questions 直接複用 SurveyQuestionSchema(對齊既有 5 題型 + config + options)
 * - audienceCriteria 直接複用 AudienceCriteriaSchema(跨環境 tagId 失效在 importer 處理)
 * - 版本欄位 `$schema = 'quanwen.survey.v1'` 寫死,日後加 v2 時 importer 用此分流
 */

export const V1_SCHEMA_TAG = 'quanwen.survey.v1' as const;

/** 平台 metadata(匯出時固定;匯入時不擋,只當 audit 線索) */
const PlatformMetaSchema = z.object({
  name: z.string().max(50),
  version: z.string().max(50),
});

/** v1 survey body — 與 CreateSurveyDto 高度重疊,但語義是「可攜模板」 */
export const QuanWenSurveyV1BodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(['standard', 'mutual']).default('standard'),
  category: z.enum(SURVEY_CATEGORIES).nullable().optional(),
  isAnonymous: z.boolean().default(true),
  rewardPoints: z.number().int().min(0).max(1000).default(0),
  targetCount: z.number().int().min(1).max(10000).default(100),
  aiReviewEnabled: z.boolean().default(true),
  externalUrl: z.string().url().max(1000).refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 http 或 https 協議' }).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  audienceCriteria: AudienceCriteriaSchema.nullable().optional(),
  questions: z.array(SurveyQuestionSchema).max(50).default([]),
});

export const QuanWenSurveyV1Schema = z.object({
  $schema: z.literal(V1_SCHEMA_TAG),
  exportedAt: z.string().datetime(),
  platform: PlatformMetaSchema,
  survey: QuanWenSurveyV1BodySchema,
});

export type QuanWenSurveyV1 = z.infer<typeof QuanWenSurveyV1Schema>;
export type QuanWenSurveyV1Body = z.infer<typeof QuanWenSurveyV1BodySchema>;

/**
 * 寬鬆 parser:容許前端/外部來源送來的 type 為 string,
 * 解析失敗時 throw 結構化錯誤(controller 轉 422)。
 */
export function parseV1(input: unknown):
  | { ok: true; data: QuanWenSurveyV1 }
  | { ok: false; issues: Array<{ path: string; message: string }> } {
  const r = QuanWenSurveyV1Schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}
