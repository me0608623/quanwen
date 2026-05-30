"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { GoogleLogo, AppleLogo, LineLogo } from "@/components/icons/oauth-logos";
import { cn } from "@/lib/cn";

type Provider = "google" | "apple" | "line";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

interface OAuthButtonsProps {
  intent?: "login" | "register";
  role?: "respondent" | "surveyor";
}

export function OAuthButtons({ intent = "login", role }: OAuthButtonsProps) {
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);

  const labels = useMemo(
    () => ({
      google: `使用 Google ${intent === "login" ? "登入" : "註冊"}`,
      apple: `使用 Apple ${intent === "login" ? "登入" : "註冊"}`,
      line: `使用 LINE ${intent === "login" ? "登入" : "註冊"}`,
    }),
    [intent]
  );

  const handleClick = (provider: Provider) => {
    if (activeProvider) return;
    setActiveProvider(provider);
    const params = new URLSearchParams({ ...(role ? { role } : {}) });
    const query = params.toString() ? `?${params.toString()}` : "";

    // Give ripple/loading one frame before navigation.
    requestAnimationFrame(() => {
      window.location.href = `${API_URL}/auth/${provider}${query}`;
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <OAuthButton
          provider="google"
          icon={<GoogleLogo size={18} />}
          label={labels.google}
          onClick={() => handleClick("google")}
          isLoading={activeProvider === "google"}
          isDisabled={activeProvider !== null}
        />
        <OAuthButton
          provider="apple"
          icon={<AppleLogo size={18} />}
          label={labels.apple}
          onClick={() => handleClick("apple")}
          isLoading={activeProvider === "apple"}
          isDisabled={activeProvider !== null}
        />
        <OAuthButton
          provider="line"
          icon={<LineLogo size={18} />}
          label={labels.line}
          onClick={() => handleClick("line")}
          isLoading={activeProvider === "line"}
          isDisabled={activeProvider !== null}
        />
      </div>
      <style jsx global>{`
        @keyframes qwen-oauth-ripple {
          0% {
            transform: scale(0.2);
            opacity: 0.36;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

interface OAuthButtonProps {
  provider: Provider;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

function OAuthButton({ provider, icon, label, onClick, isLoading = false, isDisabled = false }: OAuthButtonProps) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const styles: Record<Provider, string> = {
    google: "bg-white text-[#3C4043] border-[#DADCE0] hover:bg-slate-50 hover:border-slate-300",
    apple: "bg-black text-white border-black hover:bg-neutral-900",
    line: "bg-[#06C755] text-white border-[#06C755] hover:bg-[#05B14B]",
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        if (isDisabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ripple = {
          id: Date.now(),
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        setRipples((prev) => [...prev, ripple]);
        window.setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
        }, 520);
        onClick();
      }}
      disabled={isDisabled}
      className={cn(
        "relative overflow-hidden flex h-11 items-center justify-center gap-2.5 rounded-[10px] border text-sm font-semibold transition-all",
        "disabled:cursor-not-allowed disabled:opacity-70",
        styles[provider]
      )}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 animate-[qwen-oauth-ripple_520ms_ease-out]"
          style={{ left: r.x, top: r.y }}
        />
      ))}
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {isLoading ? "導向中..." : label}
    </button>
  );
}

export function AuthDivider({ text = "或使用電子郵件登入" }: { text?: string }) {
  return (
    <div className="my-6 flex items-center gap-3.5 text-xs tracking-widest text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      {text}
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
