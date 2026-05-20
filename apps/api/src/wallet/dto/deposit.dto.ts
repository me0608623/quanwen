import { z } from 'zod';

export const DepositSchema = z.object({
  amount: z.number().int().min(100).max(100_000)
    .describe('儲值金額（NT$，最小 100，最大 100,000）'),
});

export type DepositDto = z.infer<typeof DepositSchema>;
