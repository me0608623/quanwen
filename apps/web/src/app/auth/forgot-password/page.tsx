"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";
import { AuthShell } from "../_components/auth-shell";

const Schema = z.object({ email: z.string().email("請輸入有效的電子郵件") });
type ForgotInput = z.infer<typeof Schema>;

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [sentEmail, setSentEmail] = useState("");

  const form = useForm<ForgotInput>({
    resolver: zodResolver(Schema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotInput) =>
    forgot.mutate(values.email.trim().toLowerCase(), {
      onSuccess: () => setSentEmail(values.email),
    });

  if (sentEmail) {
    return (
      <AuthShell variant="compact">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900">郵件已寄出</h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            如果 <span className="font-semibold text-slate-900">{sentEmail}</span> 有帳號，
            <br />我們已寄出重設密碼連結。請查收信箱（含垃圾信）。
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="text-xs leading-relaxed text-amber-800">
              <strong>安全提醒：</strong>連結 1 小時內有效。為防止帳號被入侵，
              我們不會告知電子郵件是否存在於系統中。
            </p>
          </div>
          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1F6FEB] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> 回登入頁
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant="compact">
      <div className="mb-8">
        <Link
          href="/auth/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> 回登入
        </Link>
        <h2 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900">忘記密碼?</h2>
        <p className="text-sm text-slate-500">
          別擔心。輸入註冊電子郵件，我們會寄出重設密碼連結給你。
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-900">
            電子郵件
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="請輸入電子郵件"
              autoFocus
              className="h-11 rounded-[10px] border-slate-200 pl-11 text-sm focus-visible:border-[#1F6FEB] focus-visible:ring-2 focus-visible:ring-[#1F6FEB]/15"
              {...form.register("email")}
            />
          </div>
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>
          )}
        </div>

        {forgot.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractApiError(forgot.error, "發生錯誤，請再試一次")}
          </div>
        )}

        <Button
          type="submit"
          disabled={forgot.isPending}
          className="h-[46px] w-full rounded-[10px] bg-[#1F6FEB] text-base font-bold text-white shadow-sm transition-all hover:bg-[#0F2A5C] hover:shadow-lg hover:shadow-[#1F6FEB]/25 active:translate-y-px disabled:opacity-60"
        >
          {forgot.isPending ? "處理中…" : "寄出重設信"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        想起來了?{" "}
        <Link href="/auth/login" className="font-semibold text-[#1F6FEB] hover:underline">
          回登入頁
        </Link>
      </p>
    </AuthShell>
  );
}
