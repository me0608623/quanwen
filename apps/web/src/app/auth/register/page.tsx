"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";

import { AuthShell } from "../_components/auth-shell";
import { AuthDivider, OAuthButtons } from "../_components/oauth-buttons";
import { PasswordInput } from "../_components/password-input";
import { RoleToggle, type Role } from "../_components/role-toggle";

const RegisterSchema = z
  .object({
    displayName: z.string().min(2, "顯示名稱至少 2 個字").max(30, "顯示名稱最多 30 個字"),
    email: z.string().email("請輸入正確的 Email"),
    password: z
      .string()
      .min(8, "密碼至少 8 碼")
      .regex(/[A-Z]/, "需包含至少一個大寫英文字母")
      .regex(/[0-9]/, "需包含至少一個數字"),
    confirmPassword: z.string(),
    terms: z.boolean().refine((v) => v, { message: "請先同意服務條款與隱私政策" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "兩次密碼輸入不一致",
    path: ["confirmPassword"],
  });

type RegisterInput = z.infer<typeof RegisterSchema>;

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "你已取消第三方登入。",
  oauth_failed: "第三方登入失敗，請稍後再試或改用 Email 註冊。",
  email_missing: "第三方帳號未提供 Email，請改用 Email 註冊。",
};

function RegisterForm() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const registerMutation = useRegister();
  const [role, setRole] = useState<Role>("respondent");

  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const password = form.watch("password");

  const onSubmit = ({ confirmPassword: _confirmPassword, terms: _terms, ...data }: RegisterInput) =>
    registerMutation.mutate({ ...data, role });

  return (
    <AuthShell audience={role}>
      {oauthError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {OAUTH_ERRORS[oauthError] ?? "註冊發生錯誤，請稍後再試。"}
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900">建立新帳號</h2>
        <p className="text-sm text-slate-500">
          已經有帳號？{" "}
          <Link href="/auth/login" className="font-semibold text-[#126b8a] hover:underline">
            前往登入
          </Link>
        </p>
      </div>

      <div className="mb-6">
        <RoleToggle value={role} onChange={setRole} />
      </div>

      <OAuthButtons intent="register" role={role} />
      <AuthDivider text="或使用 Email 註冊" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold text-slate-900">
            顯示名稱
          </Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input
              id="displayName"
              autoComplete="nickname"
              placeholder="例如：小安"
              className="h-11 rounded-[10px] border-slate-200 pl-11 text-sm focus-visible:border-[#126b8a] focus-visible:ring-2 focus-visible:ring-[#126b8a]/15"
              {...form.register("displayName")}
            />
          </div>
          {form.formState.errors.displayName && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.displayName.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-900">
            Email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 rounded-[10px] border-slate-200 pl-11 text-sm focus-visible:border-[#126b8a] focus-visible:ring-2 focus-visible:ring-[#126b8a]/15"
              {...form.register("email")}
            />
          </div>
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-900">
            密碼
          </Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="至少 8 碼，含大寫字母與數字"
            showStrength
            value={password}
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-slate-900">
            確認密碼
          </Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="請再次輸入密碼"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs leading-relaxed text-slate-500">
          <Controller
            control={form.control}
            name="terms"
            render={({ field }) => (
              <Checkbox
                id="terms"
                className="mt-0.5"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
              />
            )}
          />
          <span>
            我已閱讀並同意
            <Link href="/terms" className="mx-1 text-slate-700 underline">
              服務條款
            </Link>
            與
            <Link href="/privacy" className="mx-1 text-slate-700 underline">
              隱私政策
            </Link>
          </span>
        </label>
        {form.formState.errors.terms && <p className="text-xs text-red-500">{form.formState.errors.terms.message}</p>}

        {registerMutation.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractApiError(registerMutation.error, "註冊失敗，請稍後再試。")}
          </div>
        )}

        <Button
          type="submit"
          disabled={registerMutation.isPending}
          className="h-[46px] w-full rounded-[10px] bg-[#126b8a] text-base font-bold text-white shadow-sm transition-all hover:bg-[#0f5d78] hover:shadow-lg hover:shadow-[#126b8a]/25 active:translate-y-px disabled:opacity-60"
        >
          {registerMutation.isPending ? "註冊中..." : "建立帳號"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#126b8a]" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
