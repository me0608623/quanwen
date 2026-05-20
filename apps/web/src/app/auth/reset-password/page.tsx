"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useResetPassword } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";
import { AuthShell } from "../_components/auth-shell";
import { PasswordInput } from "../_components/password-input";

const Schema = z
  .object({
    password: z
      .string()
      .min(8, "密碼至少 8 字")
      .regex(/[A-Z]/, "需包含大寫字母")
      .regex(/[0-9]/, "需包含數字"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "兩次輸入的密碼不一致",
    path: ["confirm"],
  });

type ResetInput = z.infer<typeof Schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const reset = useResetPassword();
  const [countdown, setCountdown] = useState(3);

  const form = useForm<ResetInput>({
    resolver: zodResolver(Schema),
    defaultValues: { password: "", confirm: "" },
  });

  const password = form.watch("password");

  useEffect(() => {
    if (!reset.isSuccess) return;
    if (countdown <= 0) {
      router.replace("/auth/login");
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [reset.isSuccess, countdown, router]);

  if (!token) {
    return (
      <AuthShell variant="compact">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900">連結已失效</h2>
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            重設密碼連結可能已過期（1 小時）或已被使用。
            <br />請重新申請。
          </p>
          <Link
            href="/auth/forgot-password"
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1F6FEB] px-6 text-sm font-bold text-white hover:bg-[#0F2A5C]"
          >
            重新申請重設信
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell variant="compact">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900">密碼已重設</h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            {countdown} 秒後自動跳轉到登入頁…
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(countdown / 3) * 100}%` }}
            />
          </div>
          <Link href="/auth/login" className="mt-4 inline-block text-sm font-semibold text-[#1F6FEB] hover:underline">
            立即前往登入
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant="compact">
      <div className="mb-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EAF2FF]">
          <Lock className="h-7 w-7 text-[#1F6FEB]" />
        </div>
        <h2 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900">設定新密碼</h2>
        <p className="text-sm text-slate-500">
          設定後將自動跳轉登入頁，請用新密碼登入。
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit((values) =>
          reset.mutate({ token, password: values.password })
        )}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-900">
            新密碼
          </Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="至少 8 字，含大寫字母與數字"
            showStrength
            value={password}
            autoFocus
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirm" className="mb-1.5 block text-xs font-semibold text-slate-900">
            再次輸入確認
          </Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="再輸入一次"
            {...form.register("confirm")}
          />
          {form.formState.errors.confirm && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.confirm.message}</p>
          )}
        </div>

        {reset.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractApiError(reset.error, "連結已失效，請重新申請")}
          </div>
        )}

        <Button
          type="submit"
          disabled={reset.isPending}
          className="h-[46px] w-full rounded-[10px] bg-[#1F6FEB] text-base font-bold text-white shadow-sm transition-all hover:bg-[#0F2A5C] hover:shadow-lg hover:shadow-[#1F6FEB]/25 active:translate-y-px disabled:opacity-60"
        >
          {reset.isPending ? "設定中…" : "設定新密碼"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1F6FEB]" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
