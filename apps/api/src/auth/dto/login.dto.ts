import { z } from 'zod';

// Accept any non-empty string as email (dev convenience: 'aa' / 'bb' work).
// Real email format check is done at register/forgot-password endpoints when needed.
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, '請輸入帳號'),
  password: z.string().min(1, '請輸入密碼'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
