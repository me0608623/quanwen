"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setToken, removeToken } from "@/lib/token";
import type { AuthUser } from "@/hooks/use-auth";

/**
 * Handles deep-link callbacks from mobile OAuth flow.
 *
 * When the API detects ?mobile=1 on OAuth entry, it sets a cookie and on
 * callback redirects to `quanwen://auth/callback?token=xxx` instead of the
 * web URL. Capacitor's AppUrlOpen listener fires this event inside the app,
 * and this component processes the token just like the web /auth/callback page.
 */
export function DeepLinkHandler() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const Capacitor = (window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        Plugins?: {
          App?: {
            addListener?: (ev: string, cb: (data: { url: string }) => void) => Promise<unknown>;
          };
        };
      };
    }).Capacitor;

    // ── App 環境偵測：如果是在 Capacitor App 內且在根路徑，自動 redirect ──
    // 重要：用 router.replace（client-side）而非 window.location.replace（hard reload），
    // 避免 Capacitor WebView 重新載入時 Bridge 與 hydration 產生 race condition。
    const isNative = Capacitor?.isNativePlatform?.() ?? false;
    const isCapacitorUA = typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("capacitor");
    if ((isNative || isCapacitorUA) && window.location.pathname === "/") {
      router.replace("/client-redirect");
      return;
    }

    if (!Capacitor?.Plugins?.App?.addListener) return;

    let cancelled = false;

    Capacitor.Plugins.App.addListener("appUrlOpen", ({ url }: { url: string }) => {
      if (cancelled) return;
      if (!url.startsWith("quanwen://")) return;

      const parsed = new URL(url);
      const path = parsed.hostname + parsed.pathname; // e.g. "auth/callback"
      const token = parsed.searchParams.get("token");
      const error = parsed.searchParams.get("error");

      // Handle auth/callback deep link
      if (path.includes("auth/callback") && token) {
        setToken(token);
        queryClient.clear();

        const controller = new AbortController();
        api
          .get<AuthUser>("/auth/me", { signal: controller.signal })
          .then(({ data }) => {
            if (cancelled) return;
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
      }

      // Handle error deep links
      if (path.includes("auth/login") && error) {
        router.replace(`/auth/login?error=${encodeURIComponent(error)}`);
        return;
      }

      // Handle settings/accounts deep links (bind results)
      if (path.includes("settings/accounts")) {
        const bound = parsed.searchParams.get("bound");
        const settingsError = parsed.searchParams.get("error");
        const qs = bound ? `bound=${bound}` : settingsError ? `error=${settingsError}` : "";
        router.replace(`/settings/accounts${qs ? `?${qs}` : ""}`);
        return;
      }
    }).catch(() => {
      // Listener registration failed — non-fatal, web flow still works
    });

    return () => {
      cancelled = true;
    };
  }, [router, queryClient]);

  return null;
}
