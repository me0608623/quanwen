import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(1, '請輸入密碼'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
