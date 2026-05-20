import { z } from 'zod';

export const WithdrawSchema = z.object({
  amount: z.number().int().min(300).max(30_000)
    .describe('提領金額（NT$，最小 300，最大單次 30,000）'),
  bankCode: z.string().length(3).describe('銀行代碼（3 碼）'),
  bankAccount: z.string().min(10).max(16).describe('銀行帳號'),
  accountName: z.string().min(2).max(50).describe('戶名'),
});

export type WithdrawDto = z.infer<typeof WithdrawSchema>;
