"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";

import { AuthShell } from "../_components/auth-shell";
import { AuthDivider, OAuthButtons } from "../_components/oauth-buttons";
import { PasswordInput } from "../_components/password-input";

const LoginSchema = z.object({
  email: z.string().min(1, "請輸入電子郵件"),
  password: z.string().min(1, "請輸入密碼"),
  remember: z.boolean(),
});

type LoginInput = z.infer<typeof LoginSchema>;

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "你已取消第三方登入。",
  oauth_failed: "第三方登入失敗，請稍後再試或改用電子郵件登入。",
  email_missing: "第三方帳號未提供電子郵件，請改用電子郵件註冊。",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const oauthError = searchParams.get("error");
  const redirectTo = searchParams.get("redirect");
  const loginMutation = useLogin();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("session_expired")) {
      setSessionExpired(true);
      sessionStorage.removeItem("session_expired");
    }
  }, []);

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const password = form.watch("password");

  const onSubmit = (data: LoginInput) =>
    loginMutation.mutate(
      { email: data.email.trim(), password: data.password },
      {
        onSuccess: () => {
          router.push(redirectTo?.startsWith("/") ? redirectTo : "/dashboard");
        },
      }
    );

  return (
    <>
      <AuthShell scene="immersive" audience="respondent">
      {sessionExpired && (
        <div className="mb-4 animate-[fadeIn_0.35s_ease-out] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          登入已逾時，請重新登入。
        </div>
      )}

      {oauthError && (
        <div className="mb-4 animate-[fadeIn_0.35s_ease-out] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {OAUTH_ERRORS[oauthError] ?? "登入發生錯誤，請稍後再試。"}
        </div>
      )}

      <div className="mb-8 animate-[fadeIn_0.45s_ease-out]">
        <h2 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900">歡迎回來</h2>
        <p className="text-sm text-slate-500">
          還沒有帳號？{" "}
          <Link href="/auth/register" className="font-semibold text-[#126b8a] hover:underline">
            建立新帳號
          </Link>
        </p>
      </div>

      <div className="animate-[fadeIn_0.65s_ease-out]">
        <OAuthButtons intent="login" role="respondent" />
      </div>

      <AuthDivider text="或使用電子郵件登入" />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="animate-[fadeIn_0.75s_ease-out]">
          <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-900">
            電子郵件
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="請輸入電子郵件"
              className="h-11 rounded-[10px] border-slate-200 pl-11 text-sm shadow-sm transition-all focus-visible:border-[#126b8a] focus-visible:ring-2 focus-visible:ring-[#126b8a]/20"
              {...form.register("email")}
            />
          </div>
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="animate-[fadeIn_0.85s_ease-out]">
          <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-900">
            密碼
          </Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="請輸入密碼"
            value={password}
            className="shadow-sm transition-all focus-visible:border-[#126b8a] focus-visible:ring-[#126b8a]/20"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 animate-[fadeIn_0.95s_ease-out]">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-500">
            <Checkbox id="remember" {...form.register("remember")} />
            記住我
          </label>
          <Link href="/auth/forgot-password" className="text-sm font-semibold text-[#126b8a] hover:underline">
            忘記密碼？
          </Link>
        </div>

        {loginMutation.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractApiError(loginMutation.error, "登入失敗，請確認帳號密碼。")}
          </div>
        )}

        <Button
          type="submit"
          disabled={loginMutation.isPending}
          className="h-[46px] w-full rounded-[10px] bg-[#126b8a] text-base font-bold text-white shadow-[0_12px_24px_-14px_rgba(18,107,138,0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] hover:shadow-[0_16px_30px_-14px_rgba(18,107,138,0.85)] active:translate-y-px disabled:opacity-60 animate-[fadeIn_1.05s_ease-out]"
        >
          {loginMutation.isPending ? "登入中..." : "登入"}
        </Button>
      </form>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400 animate-[fadeIn_1.15s_ease-out]">
        登入即代表你同意
        <Link href="/terms" className="mx-1 text-slate-500 underline">
          服務條款
        </Link>
        與
        <Link href="/privacy" className="mx-1 text-slate-500 underline">
          隱私政策
        </Link>
      </p>
      </AuthShell>
      <style jsx global>{`
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#126b8a]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

