import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DB } from '../../db';
import type { AppDb } from '../../db';
import { interestTags } from '../../db/schema';
import { SurveysService } from '../surveys.service';
import { CreateSurveySchema, type CreateSurveyDto } from '../dto/create-survey.dto';
import { parseV1 } from './quanwen-survey-v1.schema';

/**
 * Phase 1:從 QuanWenSurvey v1 JSON 匯入為新問卷。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §5.3
 *
 * 流程:
 *   1. Zod 解析 v1 schema(失敗 → 422 列出哪邊壞)
 *   2. 跨環境 tagId 過濾(找不到的丟棄並收進 warnings,不擋整份匯入)
 *   3. 轉成 CreateSurveyDto
 *   4. 走既有 SurveysService.create() — 自動 status='draft'(不會直接 published)
 *
 * 回傳:
 *   - id / status / questionsCount(成功落到 DB 的題目數)
 *   - warnings[]:非致命警告(目前主要是 tagId 失效)
 */
export interface ImportResult {
  id: string;
  status: string;
  questionsCount: number;
  warnings: string[];
}

@Injectable()
export class SurveyImportService {
  private readonly logger = new Logger(SurveyImportService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly surveys: SurveysService,
  ) {}

  async importFromJson(userId: string, raw: unknown): Promise<ImportResult> {
    const normalizedInput = this.normalizeImportPayload(raw);

    // 1. Zod 解析
    const parsed = parseV1(normalizedInput);
    if (!parsed.ok) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: '匯入 JSON schema 驗證失敗',
          details: parsed.issues,
        },
      });
    }

    const warnings: string[] = [];
    const v1 = parsed.data;
    const survey = v1.survey;

    // 2. 跨環境 tagId 過濾
    let audience = survey.audienceCriteria ?? undefined;
    if (audience?.requiredTagIds && audience.requiredTagIds.length > 0) {
      const existingRows = await this.db
        .select({ id: interestTags.id })
        .from(interestTags)
        .where(inArray(interestTags.id, audience.requiredTagIds));
      const validIds = new Set(existingRows.map((r) => r.id));
      const validTagIds = audience.requiredTagIds.filter((id) => validIds.has(id));
      const dropped = audience.requiredTagIds.length - validTagIds.length;
      if (dropped > 0) {
        warnings.push(
          `audienceCriteria.requiredTagIds: ${dropped} 個跨環境 tag 找不到已丟棄`,
        );
        audience = { ...audience, requiredTagIds: validTagIds };
      }
    }

    // 3. 組 CreateSurveyDto
    const dto: CreateSurveyDto = {
      title: survey.title,
      description: survey.description ?? undefined,
      type: survey.type,
      category: survey.category ?? undefined,
      isAnonymous: survey.isAnonymous,
      rewardPoints: survey.rewardPoints,
      targetCount: survey.targetCount,
      aiReviewEnabled: survey.aiReviewEnabled,
      externalUrl: survey.externalUrl ?? undefined,
      expiresAt: survey.expiresAt ?? undefined,
      audienceCriteria: audience,
      questions: survey.questions,
    };

    // 4. 走既有 create — 落 status='draft'
    const created = await this.surveys.create(userId, dto);

    this.logger.log(
      `imported survey ${created.id} for user ${userId.slice(0, 8)}: ` +
        `${created.questions.length} questions, ${warnings.length} warnings`,
    );

    return {
      id: created.id,
      status: created.status,
      questionsCount: created.questions.length,
      warnings,
    };
  }

  private normalizeImportPayload(raw: unknown) {
    const parsed = parseV1(raw);
    if (parsed.ok) {
      return parsed.data;
    }

    const directCreate = CreateSurveySchema.safeParse(raw);
    if (!directCreate.success) {
      return raw;
    }

    return {
      $schema: 'quanwen.survey.v1' as const,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'direct-import' },
      survey: {
        title: directCreate.data.title,
        description: directCreate.data.description ?? null,
        type: directCreate.data.type,
        category: directCreate.data.category ?? null,
        isAnonymous: directCreate.data.isAnonymous,
        rewardPoints: directCreate.data.rewardPoints,
        targetCount: directCreate.data.targetCount,
        aiReviewEnabled: directCreate.data.aiReviewEnabled,
        externalUrl: directCreate.data.externalUrl ?? null,
        expiresAt: directCreate.data.expiresAt ?? null,
        audienceCriteria: directCreate.data.audienceCriteria ?? null,
        questions: directCreate.data.questions ?? [],
      },
    };
  }
}
