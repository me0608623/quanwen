"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setToken, removeToken } from "@/lib/token";
import type { AuthUser } from "@/hooks/use-auth";
import { AuthShell } from "../_components/auth-shell";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      router.replace(`/auth/login?error=${encodeURIComponent(error)}`);
      return;
    }

    const token = searchParams.get("token");
    if (!token) {
      router.replace("/auth/login");
      return;
    }

    setToken(token);
    queryClient.clear(); // 清除前一個用戶的快取，避免跨帳號資料污染

    const controller = new AbortController();

    api
      .get<AuthUser>("/auth/me", { signal: controller.signal })
      .then(({ data }) => {
        queryClient.setQueryData(["auth", "me"], data);
        if (data.role === "admin") router.replace("/admin");
        else if (data.role === "surveyor") router.replace("/dashboard");
        else router.replace("/tasks");
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED") return;
        removeToken();
        router.replace("/auth/login");
      });

    return () => controller.abort();
  }, [searchParams, router, queryClient]);

  return (
    <AuthShell variant="compact">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-[#1F6FEB]" />
        <h2 className="mb-2 text-2xl font-bold text-slate-900">驗證中…</h2>
        <p className="text-sm text-slate-500">正在完成登入，請稍候</p>
      </div>
    </AuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1F6FEB]" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
