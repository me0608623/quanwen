"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { useVerifyEmail } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";
import { AuthShell } from "../_components/auth-shell";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const verifyMutation = useVerifyEmail();
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;
    verifyMutation.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isPending = verifyMutation.status === "idle" || verifyMutation.isPending;

  return (
    <AuthShell variant="compact">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {isPending && (
          <>
            <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-[#1F6FEB]" />
            <h2 className="mb-2 text-2xl font-bold text-slate-900">驗證中</h2>
            <p className="mb-6 text-sm text-slate-500">正在驗證你的電子郵件，請稍候。</p>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-slate-300 px-6 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              返回登入
            </Link>
          </>
        )}

        {verifyMutation.isSuccess && (
          <>
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-slate-900">電子郵件驗證成功</h2>
            <p className="mb-8 text-sm leading-relaxed text-slate-500">
              你的電子郵件已完成驗證，現在可以繼續使用帳號功能。
            </p>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1F6FEB] px-6 text-sm font-bold text-white hover:bg-[#0F2A5C]"
            >
              前往登入
            </Link>
          </>
        )}

        {verifyMutation.isError && (
          <>
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-slate-900">驗證失敗</h2>
            <p className="mb-8 text-sm leading-relaxed text-slate-500">
              {extractApiError(verifyMutation.error, "驗證連結無效或已過期，請重新發送驗證信。")}
            </p>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1F6FEB] px-6 text-sm font-bold text-white hover:bg-[#0F2A5C]"
            >
              返回登入
            </Link>
          </>
        )}

        {!token && !isPending && (
          <>
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-slate-900">缺少驗證參數</h2>
            <p className="mb-8 text-sm text-slate-500">目前連結缺少 token，請從信件中的驗證連結重新進入。</p>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1F6FEB] px-6 text-sm font-bold text-white hover:bg-[#0F2A5C]"
            >
              返回登入
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1F6FEB]" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
