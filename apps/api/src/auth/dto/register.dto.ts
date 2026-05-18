import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z
    .string()
    .min(8, '密碼至少 8 個字元')
    .max(72, '密碼最多 72 個字元')
    .regex(/[A-Z]/, '密碼需包含至少一個大寫字母')
    .regex(/[0-9]/, '密碼需包含至少一個數字'),
  displayName: z.string().min(2, '顯示名稱至少 2 個字元').max(100, '顯示名稱最多 100 個字元'),
  role: z.enum(['surveyor', 'respondent']),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
