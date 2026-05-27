import { z } from 'zod';

/** POST /surveys/pricing-advice 輸入。對齊設計文件 §5.4。 */
export const PricingAdviceSchema = z.object({
  questions: z
    .array(
      z.object({
        type: z.string(),
        isRequired: z.boolean().optional(),
        options: z.array(z.object({ label: z.string().optional() })).optional(),
        config: z
          .object({
            rows: z.number().int().optional(),
            minLength: z.number().int().optional(),
            mediaWatchSec: z.number().int().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .max(50)
    .default([]),
  /** 前言/說明字數（估閱讀時間）。 */
  introChars: z.number().int().min(0).max(100000).optional(),
  /** 發問卷者目前填入的單份獎勵（有才回警告）。 */
  proposedRewardNt: z.number().int().min(0).max(100000).optional(),
});

export type PricingAdviceDto = z.infer<typeof PricingAdviceSchema>;
