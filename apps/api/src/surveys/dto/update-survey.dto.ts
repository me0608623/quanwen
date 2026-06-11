import { z } from 'zod';
import { CreateSurveyBaseSchema } from './create-survey.dto';

// Override the 5 fields that carry .default() in CreateSurveyBaseSchema.
// Without this, ZodValidationPipe injects those defaults even when the client
// omits the fields, causing updatePublishedInfo to see them as non-undefined
// and throw 400 "不可修改" on every published-survey PATCH.
export const UpdateSurveySchema = CreateSurveyBaseSchema
  .extend({
    type: z.enum(['standard', 'mutual']).optional(),
    aiReviewEnabled: z.boolean().optional(),
    rewardPoints: z.number().int().min(0).max(1000).optional(),
    targetCount: z.number().int().min(1).max(10000).optional(),
    isAnonymous: z.boolean().optional(),
  })
  .partial()
  .superRefine((dto, ctx) => {
    if (dto.rewardMode !== 'lottery') return;
    if (!dto.lotteryPrize) {
      ctx.addIssue({ code: 'custom', path: ['lotteryPrize'], message: '抽獎回饋必須填寫獎品名稱' });
    }
    if (!dto.lotteryWinnerCount) {
      ctx.addIssue({ code: 'custom', path: ['lotteryWinnerCount'], message: '抽獎回饋必須設定中獎名額' });
    }
    if (!dto.lotteryDrawMode) {
      ctx.addIssue({ code: 'custom', path: ['lotteryDrawMode'], message: '抽獎回饋必須設定開獎方式' });
    }
    if (dto.lotteryDrawMode === 'scheduled' && !dto.lotteryDrawAt) {
      ctx.addIssue({ code: 'custom', path: ['lotteryDrawAt'], message: '指定日期開獎必須設定開獎時間' });
    }
    if (dto.lotteryDrawMode === 'scheduled' && dto.lotteryDrawAt && new Date(dto.lotteryDrawAt).getTime() <= Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['lotteryDrawAt'], message: '指定開獎時間必須晚於目前時間' });
    }
    if (dto.lotteryTermsAccepted !== true) {
      ctx.addIssue({ code: 'custom', path: ['lotteryTermsAccepted'], message: '建立抽獎問卷前必須接受獎品履約條款' });
    }
  });
export type UpdateSurveyDto = z.infer<typeof UpdateSurveySchema>;
