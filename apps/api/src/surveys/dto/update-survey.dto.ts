import { z } from 'zod';
import { CreateSurveyBaseSchema } from './create-survey.dto';

export const UpdateSurveySchema = CreateSurveyBaseSchema.partial().superRefine((dto, ctx) => {
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
