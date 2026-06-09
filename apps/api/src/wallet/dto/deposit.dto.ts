import { z } from 'zod';

export const DepositSchema = z.object({
  amount: z.number().int().min(1).max(10_000_000)
    .describe('儲值金額（NT$，實際限額由系統設定決定）'),
});

export type DepositDto = z.infer<typeof DepositSchema>;
