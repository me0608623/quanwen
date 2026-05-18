'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRegister } from '@/hooks/use-auth';

const registerSchema = z
  .object({
    role: z.enum(['surveyor', 'respondent']),
    email: z.string().email('請輸入有效的電子郵件'),
    displayName: z.string().min(2, '顯示名稱至少 2 個字元').max(100),
    password: z
      .string()
      .min(8, '密碼至少 8 個字元')
      .regex(/[A-Z]/, '需包含大寫字母')
      .regex(/[0-9]/, '需包含數字'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '兩次密碼不一致',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'respondent' },
  });

  const role = watch('role');

  const onSubmit = ({ confirmPassword: _, ...data }: RegisterForm) =>
    registerMutation.mutate(data);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-8">
      <div className="w-full max-w-md rounded-lg bg-background p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-bold">建立帳號</h1>

        {/* Role Selector */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          {(['respondent', 'surveyor'] as const).map((r) => (
            <label
              key={r}
              className={`cursor-pointer rounded-md border p-3 text-center text-sm transition-colors ${
                role === r
                  ? 'border-primary bg-primary/5 font-medium text-primary'
                  : 'border-border hover:bg-secondary'
              }`}
            >
              <input type="radio" value={r} {...register('role')} className="sr-only" />
              {r === 'respondent' ? '受試者（填問卷賺獎勵）' : '問券方（發問卷找受試者）'}
            </label>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">顯示名稱</label>
            <input
              {...register('displayName')}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="你的名字"
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">電子郵件</label>
            <input
              type="email"
              {...register('email')}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">密碼</label>
            <input
              type="password"
              {...register('password')}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="至少 8 碼，含大寫字母與數字"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">確認密碼</label>
            <input
              type="password"
              {...register('confirmPassword')}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="再輸入一次密碼"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          {registerMutation.error && (
            <p className="text-sm text-destructive">
              {(registerMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '註冊失敗，請再試一次'}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || registerMutation.isPending}
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {registerMutation.isPending ? '建立中...' : '建立帳號'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          已有帳號？{' '}
          <Link href="/auth/login" className="text-primary hover:underline">
            直接登入
          </Link>
        </p>
      </div>
    </div>
  );
}
