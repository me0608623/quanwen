"use client";

import Link from "next/link";
import { Gift, ShieldCheck, Target } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

interface AuthShellProps {
  variant?: "full" | "compact";
  scene?: "default" | "immersive";
  audience?: "respondent" | "surveyor";
  children: React.ReactNode;
}

export function AuthShell({
  variant = "full",
  scene = "default",
  audience = "surveyor",
  children,
}: AuthShellProps) {
  const immersive = scene === "immersive";
  const isSurveyor = audience === "surveyor";
  const [motionMode, setMotionMode] = useState<"full" | "lite" | "minimal">("full");
  const [cardTilt, setCardTilt] = useState({ x: 0, y: 0 });
  const [cardActive, setCardActive] = useState(false);

  const themeVars = (isSurveyor
    ? {
        "--aw-primary": "#0f3d73",
        "--aw-secondary": "#126b8a",
        "--aw-tertiary": "#0a8f8f",
        "--aw-accent": "#f59e0b",
        "--aw-ink": "#0f172a",
      }
    : {
        "--aw-primary": "#14532d",
        "--aw-secondary": "#0f766e",
        "--aw-tertiary": "#0284c7",
        "--aw-accent": "#f97316",
        "--aw-ink": "#0f172a",
      }) as CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setMotionMode("minimal");
      return;
    }

    const nav = window.navigator as Navigator & { deviceMemory?: number };
    const deviceMemory = nav.deviceMemory ?? 8;
    const cores = nav.hardwareConcurrency ?? 8;
    const lowPerf = deviceMemory <= 4 || cores <= 4;
    setMotionMode(lowPerf ? "lite" : "full");
  }, []);

  const motionLite = motionMode === "lite";
  const motionMinimal = motionMode === "minimal";

  const cardTransform = useMemo(() => {
    if (!immersive) return undefined;
    const rotateY = -5 + cardTilt.x * 5;
    const rotateX = 2 - cardTilt.y * 5;
    return `perspective(1200px) rotateY(${rotateY.toFixed(2)}deg) rotateX(${rotateX.toFixed(2)}deg) translateY(${cardActive ? -2 : 0}px)`;
  }, [immersive, cardTilt, cardActive]);

  const glareStyle = useMemo(() => {
    const gx = 50 + cardTilt.x * 16;
    const gy = 32 + cardTilt.y * 12;
    return {
      background: `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.52), rgba(255,255,255,0) 42%)`,
    } as CSSProperties;
  }, [cardTilt]);

  return (
    <>
      <div
        className={cn(
          "auth-shell-root grid min-h-screen lg:grid-cols-[1.2fr_1fr]",
          motionMode === "lite" && "motion-lite",
          motionMode === "minimal" && "motion-minimal"
        )}
        data-motion={motionMode}
        style={themeVars}
      >
        <aside className="relative hidden overflow-hidden bg-[#0b1f35] p-10 text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
          <div
            className={cn(
              "qwen-heavy pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f3d73] via-[#126b8a] to-[#0a8f8f] dark:from-[#071527] dark:via-[#0a3d5d] dark:to-[#0a5560] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              !motionLite && !motionMinimal && "animate-[qwen-bg-shift_16s_ease-in-out_infinite]",
              isSurveyor ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={cn(
              "qwen-heavy pointer-events-none absolute inset-0 bg-gradient-to-br from-[#14532d] via-[#0f766e] to-[#0284c7] dark:from-[#06211b] dark:via-[#0b4d4a] dark:to-[#0d4f70] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              !motionLite && !motionMinimal && "animate-[qwen-bg-shift-alt_18s_ease-in-out_infinite]",
              isSurveyor ? "opacity-0" : "opacity-100"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_55%_35%,rgba(255,255,255,0.28),transparent_42%)] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              isSurveyor ? "opacity-70 blur-[1px]" : "opacity-45 blur-[2px]"
            )}
          />
          <div
            className={cn(
              "qwen-heavy pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:42px_42px]",
              !motionLite && !motionMinimal && "animate-[qwen-grid-drift_30s_linear_infinite]"
            )}
          />
          <div
            className={cn(
              "qwen-heavy pointer-events-none absolute inset-0 hidden opacity-0 dark:block dark:opacity-45 [background-image:radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.22)_1px,transparent_1px),radial-gradient(circle_at_72%_32%,rgba(255,255,255,0.17)_1px,transparent_1px),radial-gradient(circle_at_44%_68%,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:120px_120px]",
              !motionLite && !motionMinimal && "animate-[qwen-stars-drift_44s_linear_infinite]"
            )}
          />
          <div className="pointer-events-none absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_30%_14%,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_84%_84%,rgba(20,184,166,0.2),transparent_38%)]" />
          <div className={cn("qwen-heavy pointer-events-none absolute -right-44 -top-40 h-[480px] w-[480px] rounded-full bg-[var(--aw-accent)]/20 blur-3xl", !motionLite && !motionMinimal && "animate-[qwen-blob-sway_11s_ease-in-out_infinite]")} />
          <div className={cn("qwen-heavy pointer-events-none absolute -bottom-28 -left-40 h-[420px] w-[420px] rounded-full bg-cyan-300/20 blur-3xl", !motionLite && !motionMinimal && "animate-[qwen-blob-sway_14s_ease-in-out_infinite]")} />
          {!motionLite && !motionMinimal ? <CinematicDust /> : null}

          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-0 transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              isSurveyor
                ? "translate-y-0 opacity-100 blur-0 scale-100"
                : "translate-y-2 opacity-0 blur-[2px] scale-[0.985]"
            )}
          >
            <TechMeshScene reduceMotion={motionLite || motionMinimal} />
            <QuestionnaireFlipScene immersive={immersive} reduceMotion={motionLite || motionMinimal} />
          </div>
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-0 transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              isSurveyor
                ? "translate-y-2 opacity-0 blur-[2px] scale-[0.985]"
                : "translate-y-0 opacity-100 blur-0 scale-100"
            )}
          >
            <RespondentParticlesScene reduceMotion={motionLite || motionMinimal} />
            <RespondentFlowScene immersive={immersive} reduceMotion={motionLite || motionMinimal} />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[3] bg-[linear-gradient(90deg,rgba(2,8,23,0.42)_0%,rgba(2,8,23,0.26)_38%,rgba(2,8,23,0.06)_68%,transparent_100%)]" />

          <div className="relative z-10 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-85">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-lg font-black tracking-tight text-[var(--aw-secondary)] shadow-lg shadow-black/20", !motionLite && !motionMinimal && "animate-[qwen-logo-bob_5.4s_ease-in-out_infinite]")}>
                券
              </div>
              <div>
                <div className="text-lg font-bold">券問</div>
                <div className="text-[11px] tracking-[1.5px] opacity-75">QUANWEN</div>
              </div>
            </Link>
            <span className={cn("rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm", !motionLite && !motionMinimal && "animate-[qwen-pill-glow_3.4s_ease-in-out_infinite]")}>
              Beta
            </span>
          </div>

          <div className="relative z-10 max-w-[520px]">
            {/* 深色襯底 halo：避免白字標題疊在懸浮白卡上看不清 */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-8 -z-10 h-[360px] w-[min(620px,118%)] rounded-[2.5rem] bg-[radial-gradient(120%_100%_at_18%_30%,rgba(4,12,24,0.82),rgba(4,12,24,0.5)_46%,transparent_74%)] blur-[6px]"
            />
            {isSurveyor && (
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--aw-accent)]" />
                問卷方模式
              </div>
            )}

            {variant === "full" ? (
              <>
                <h1 className={cn("mb-5 text-4xl font-extrabold leading-[1.12] tracking-tight drop-shadow-[0_8px_22px_rgba(2,8,23,0.45)] [text-shadow:0_2px_10px_rgba(2,8,23,0.55),0_1px_2px_rgba(2,8,23,0.7)] lg:text-[44px]", !motionMinimal && "animate-[qwen-content-rise_760ms_cubic-bezier(0.16,1,0.3,1)]")}>
                  {isSurveyor ? (
                    <>
                      更快找到對的人，
                      <br />
                      更穩拿到高品質答案。
                    </>
                  ) : (
                    <>
                      更快找到適合任務，
                      <br />
                      更安心完成填答回饋。
                    </>
                  )}
                </h1>
                <p className={cn("mb-8 text-base leading-relaxed text-white/90 drop-shadow-[0_5px_14px_rgba(2,8,23,0.38)] [text-shadow:0_1px_6px_rgba(2,8,23,0.5)]", !motionMinimal && "animate-[qwen-content-rise_900ms_cubic-bezier(0.16,1,0.3,1)]")}>
                  {isSurveyor ? (
                    <>
                      從招募、審核到回饋，一個平台完成。
                      <br />
                      用 AI 審核和在地獎勵系統，讓每份問卷都更可靠。
                    </>
                  ) : (
                    <>
                      精準推薦、快速作答、透明審核與即時回饋。
                      <br />
                      你的時間被重視，你的回答有價值。
                    </>
                  )}
                </p>

                <div className="grid gap-3">
                  <FeatureItem
                    icon={<Target className="h-5 w-5" />}
                    title={isSurveyor ? "精準媒合" : "任務推薦"}
                    desc={isSurveyor ? "依人口與行為標籤找到更對的受試者" : "依興趣與可用時段推薦適合填答任務"}
                    immersive={immersive}
                    index={0}
                    motionMode={motionMode}
                  />
                  <FeatureItem
                    icon={<ShieldCheck className="h-5 w-5" />}
                    title={isSurveyor ? "AI 品質審核" : "公平審核"}
                    desc={isSurveyor ? "即時偵測異常作答，降低資料噪音" : "品質規則透明，降低誤判與退件焦慮"}
                    immersive={immersive}
                    index={1}
                    motionMode={motionMode}
                  />
                  <FeatureItem
                    icon={<Gift className="h-5 w-5" />}
                    title={isSurveyor ? "在地化獎勵" : "即時回饋"}
                    desc={isSurveyor ? "現金、點數、禮券三軌並行" : "完成任務可快速累積點數與獎勵"}
                    immersive={immersive}
                    index={2}
                    motionMode={motionMode}
                  />
                </div>
              </>
            ) : (
              <>
                <h1 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight">
                  快速驗證身份，
                  <br />
                  安心完成帳號流程。
                </h1>
                <p className="text-base leading-relaxed text-white/80">我們會用最少資訊、最清楚流程，完成必要驗證。</p>
              </>
            )}
          </div>

          <div className="relative z-10 text-xs opacity-65">© 2026 券問 QuanWen — 值得信賴的問卷平台</div>
        </aside>

        <main className="relative flex items-center justify-center overflow-hidden bg-[#f8fafc] p-6 dark:bg-[#020917] lg:p-14">
          <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-85 [background-image:radial-gradient(circle_at_30%_20%,rgba(18,107,138,0.14),transparent_40%),radial-gradient(circle_at_75%_80%,rgba(245,158,11,0.13),transparent_45%)] dark:[background-image:radial-gradient(circle_at_24%_16%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_78%_78%,rgba(20,184,166,0.18),transparent_42%)]" />
          <div
            className="relative z-10 w-full max-w-[430px] rounded-3xl border border-white/70 bg-white/92 p-6 shadow-[0_18px_60px_-24px_rgba(15,23,42,0.45)] dark:shadow-[0_24px_70px_-24px_rgba(2,132,199,0.38)] backdrop-blur-xl transition-transform duration-300 lg:p-8"
            style={immersive ? { transform: cardTransform, willChange: "transform" } : undefined}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width - 0.5;
              const py = (e.clientY - rect.top) / rect.height - 0.5;
              setCardTilt({ x: px, y: py });
              setCardActive(true);
            }}
            onMouseLeave={() => {
              setCardTilt({ x: 0, y: 0 });
              setCardActive(false);
            }}
          >
            {immersive && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-300",
                  cardActive ? "opacity-100" : "opacity-55"
                )}
                style={glareStyle}
              />
            )}
            <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--aw-secondary)] text-base font-black text-white shadow-lg shadow-[var(--aw-secondary)]/30">
                券
              </div>
              <span className="text-base font-bold text-[var(--aw-ink)]">券問 QuanWen</span>
            </Link>
            {children}
          </div>
        </main>
      </div>

      <style jsx global>{`
        @keyframes qwen-float {
          0%,
          100% {
            transform: translateY(0px) rotate(-3deg);
          }
          50% {
            transform: translateY(-8px) rotate(-1deg);
          }
        }
        @keyframes qwen-bg-shift {
          0%,
          100% {
            filter: saturate(1) brightness(1);
            transform: scale(1);
          }
          50% {
            filter: saturate(1.12) brightness(1.04);
            transform: scale(1.04);
          }
        }
        @keyframes qwen-bg-shift-alt {
          0%,
          100% {
            filter: saturate(1) brightness(1);
            transform: scale(1.01) translateX(0);
          }
          50% {
            filter: saturate(1.1) brightness(1.05);
            transform: scale(1.05) translateX(-8px);
          }
        }
        @keyframes qwen-grid-drift {
          0% {
            background-position: 0 0, 0 0;
          }
          100% {
            background-position: 42px 42px, 42px 42px;
          }
        }
        @keyframes qwen-stars-drift {
          0% {
            background-position: 0 0, 0 0, 0 0;
          }
          100% {
            background-position: 120px 80px, -100px 140px, 80px -120px;
          }
        }
        @keyframes qwen-blob-sway {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-18px, 14px, 0) scale(1.08);
          }
        }
        @keyframes qwen-logo-bob {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-4px) rotate(-3deg);
          }
        }
        @keyframes qwen-pill-glow {
          0%,
          100% {
            box-shadow: 0 0 0 rgba(255, 255, 255, 0);
          }
          50% {
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.22);
          }
        }
        @keyframes qwen-content-rise {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes qwen-card-breathe {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @keyframes qwen-page-flip {
          0%,
          16% {
            opacity: 0;
            transform: perspective(1200px) rotateY(72deg) translateX(38px) translateY(8px) scale(0.97);
          }
          22%,
          48% {
            opacity: 1;
            transform: perspective(1200px) rotateY(0deg) translateX(0px) translateY(0px) scale(1);
          }
          52% {
            opacity: 1;
            transform: perspective(1200px) rotateY(-6deg) translateX(-6px) translateY(-1px) scale(0.995);
          }
          66%,
          100% {
            opacity: 0;
            transform: perspective(1200px) rotateY(-68deg) translateX(-44px) translateY(-4px) scale(0.96);
          }
        }
        @keyframes qwen-page-flip-alt {
          0%,
          22% {
            opacity: 0;
            transform: perspective(1200px) rotateY(64deg) translateX(32px) translateY(6px) scale(0.98);
          }
          28%,
          60% {
            opacity: 0.95;
            transform: perspective(1200px) rotateY(2deg) translateX(0px) translateY(0px) scale(1);
          }
          70%,
          100% {
            opacity: 0;
            transform: perspective(1200px) rotateY(-70deg) translateX(-42px) translateY(-6px) scale(0.95);
          }
        }
        @keyframes qwen-corner-curl {
          0%,
          20% {
            opacity: 0;
            transform: rotate(0deg) scale(0.9);
          }
          28%,
          62% {
            opacity: 1;
            transform: rotate(-3deg) scale(1);
          }
          70%,
          100% {
            opacity: 0;
            transform: rotate(-8deg) scale(0.92);
          }
        }
        @keyframes qwen-mesh-pulse {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.03);
          }
        }
        @keyframes qwen-node-drift {
          0%,
          100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-5px) translateX(3px);
          }
        }
        @keyframes qwen-answer-float {
          0%,
          100% {
            transform: translateY(0px) rotate(2deg);
          }
          50% {
            transform: translateY(-10px) rotate(0deg);
          }
        }
        @keyframes qwen-progress-run {
          0%,
          10% {
            width: 10%;
          }
          45% {
            width: 64%;
          }
          75% {
            width: 88%;
          }
          100% {
            width: 100%;
          }
        }
        @keyframes qwen-reward-pop {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.75;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }
        .motion-minimal .qwen-heavy {
          animation: none !important;
          transition-duration: 180ms !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-shell-root .qwen-heavy {
            animation: none !important;
            transition-duration: 160ms !important;
          }
        }
      `}</style>
    </>
  );
}

function QuestionnaireFlipScene({ immersive, reduceMotion = false }: { immersive?: boolean; reduceMotion?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute right-10 top-24 z-[1] hidden w-[300px] lg:block"
      style={immersive ? { transform: "perspective(1400px) rotateY(-12deg) rotateX(4deg)" } : undefined}
    >
      <div className={cn("relative h-[250px]", !reduceMotion && "animate-[qwen-float_8s_ease-in-out_infinite]")}>
        <div className="absolute -bottom-6 left-8 h-10 w-56 rounded-full bg-slate-950/30 blur-xl" />
        <SurveySheet className="z-[1] translate-x-3 translate-y-3 rotate-[-7deg] opacity-35" />
        <SurveySheet className="z-[2] translate-x-2 translate-y-2 rotate-[-5deg] opacity-55" />
        <SurveySheet className="z-[3] translate-x-1 translate-y-1 rotate-[-3deg] opacity-75" />
        <SurveySheet className={cn("z-[4]", !reduceMotion && "animate-[qwen-page-flip_7.8s_cubic-bezier(0.22,0.61,0.36,1)_infinite]")} withFold />
        {!reduceMotion ? (
          <SurveySheet className="z-[5] animate-[qwen-page-flip-alt_9.6s_cubic-bezier(0.16,1,0.3,1)_infinite] [animation-delay:1.9s]" withFold />
        ) : null}
      </div>
    </div>
  );
}

function SurveySheet({ className, withFold = false }: { className?: string; withFold?: boolean }) {
  return (
    <div
      className={`absolute left-0 top-0 h-[210px] w-[260px] rounded-2xl border border-white/60 bg-white/90 p-4 shadow-[0_24px_45px_-28px_rgba(2,8,23,0.7)] backdrop-blur ${className ?? ""}`}
    >
      {withFold ? (
        <>
          <div className="pointer-events-none absolute right-0 top-0 h-12 w-12 origin-top-right rounded-tr-2xl bg-gradient-to-bl from-white/95 via-white/75 to-transparent shadow-[-10px_12px_18px_-14px_rgba(15,23,42,0.7)] animate-[qwen-corner-curl_7.8s_ease-in-out_infinite]" />
          <div className="pointer-events-none absolute right-[1px] top-[1px] h-10 w-10 origin-top-right rounded-tr-2xl bg-gradient-to-bl from-slate-200/45 to-transparent blur-[0.2px] animate-[qwen-corner-curl_7.8s_ease-in-out_infinite]" />
        </>
      ) : null}
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-semibold text-cyan-700">品牌體驗調查</span>
        <span className="text-[10px] text-slate-400">第 3 題</span>
      </div>
      <div className="mb-1 h-2.5 w-44 rounded bg-slate-300/80" />
      <div className="mb-4 h-2.5 w-56 rounded bg-slate-200/80" />

      <div className="mb-3 rounded-lg border border-slate-200/90 bg-white/95 p-2.5">
        <div className="mb-2 h-2 w-36 rounded bg-slate-200" />
        <div className="flex items-center justify-between gap-1">
          {["很不同意", "不同意", "普通", "同意", "很同意"].map((label, idx) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span
                className={`h-2.5 w-2.5 rounded-full border ${idx === 3 ? "border-cyan-500 bg-cyan-500/20" : "border-slate-300 bg-white"}`}
              />
              <span className="text-[7px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-2 w-48 rounded bg-slate-200/90" />
        <div className="h-2 w-40 rounded bg-slate-100/95" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-2 w-20 rounded-full bg-amber-300/70" />
        <div className="h-6 w-14 rounded-md bg-cyan-500/90" />
      </div>
    </div>
  );
}

function TechMeshScene({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      <svg className="absolute inset-0 h-full w-full opacity-35" viewBox="0 0 900 900" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className={cn(!reduceMotion && "animate-[qwen-mesh-pulse_7.5s_ease-in-out_infinite]")}>
          <path d="M110 180L260 260L420 200L600 290L760 250" stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" />
          <path d="M120 360L300 430L470 380L650 470L790 420" stroke="rgba(255,255,255,0.32)" strokeWidth="1.2" />
          <path d="M80 520L230 610L400 560L560 640L760 590" stroke="rgba(255,255,255,0.3)" strokeWidth="1.1" />
          <path d="M160 700L320 760L520 720L700 790" stroke="rgba(255,255,255,0.28)" strokeWidth="1.1" />
        </g>
      </svg>
      <div className={cn("absolute left-[18%] top-[24%] h-2.5 w-2.5 rounded-full bg-cyan-200/80 shadow-[0_0_14px_rgba(125,211,252,0.85)]", !reduceMotion && "animate-[qwen-node-drift_5.6s_ease-in-out_infinite]")} />
      <div className={cn("absolute left-[36%] top-[29%] h-2 w-2 rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.65)]", !reduceMotion && "animate-[qwen-node-drift_6.3s_ease-in-out_infinite]")} />
      <div className={cn("absolute left-[56%] top-[35%] h-2.5 w-2.5 rounded-full bg-amber-200/85 shadow-[0_0_12px_rgba(252,211,77,0.8)]", !reduceMotion && "animate-[qwen-node-drift_6.8s_ease-in-out_infinite]")} />
      <div className={cn("absolute left-[28%] top-[57%] h-2.5 w-2.5 rounded-full bg-cyan-100/80 shadow-[0_0_12px_rgba(165,243,252,0.8)]", !reduceMotion && "animate-[qwen-node-drift_5.2s_ease-in-out_infinite]")} />
      <div className={cn("absolute left-[62%] top-[66%] h-2 w-2 rounded-full bg-white/85 shadow-[0_0_12px_rgba(255,255,255,0.65)]", !reduceMotion && "animate-[qwen-node-drift_7.1s_ease-in-out_infinite]")} />
    </div>
  );
}

function RespondentParticlesScene({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      <div className="absolute left-[14%] top-[22%] h-24 w-24 rounded-full bg-emerald-200/15 blur-2xl" />
      <div className="absolute left-[48%] top-[18%] h-20 w-20 rounded-full bg-sky-200/15 blur-2xl" />
      <div className="absolute left-[68%] top-[38%] h-16 w-16 rounded-full bg-orange-200/20 blur-xl" />
      <svg className={cn("absolute inset-0 h-full w-full opacity-30", !reduceMotion && "animate-[qwen-mesh-pulse_10s_ease-in-out_infinite]")} viewBox="0 0 900 900" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M120 260C220 250 240 340 340 330C430 320 460 250 560 260C660 270 690 350 790 340" stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" strokeDasharray="6 8" />
        <path d="M100 520C190 510 240 590 330 580C430 570 470 510 560 520C650 530 700 610 800 600" stroke="rgba(255,255,255,0.32)" strokeWidth="1.1" strokeDasharray="5 9" />
      </svg>
    </div>
  );
}

function RespondentFlowScene({ immersive, reduceMotion = false }: { immersive?: boolean; reduceMotion?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute right-12 top-24 z-[1] hidden w-[300px] lg:block"
      style={immersive ? { transform: "perspective(1400px) rotateY(-10deg) rotateX(3deg)" } : undefined}
    >
      <div className={cn("relative h-[250px]", !reduceMotion && "animate-[qwen-answer-float_7.2s_ease-in-out_infinite]")}>
        <div className="absolute -bottom-6 left-10 h-10 w-56 rounded-full bg-slate-950/28 blur-xl" />

        <div className="absolute left-2 top-8 z-[1] h-[170px] w-[230px] rounded-2xl border border-white/40 bg-white/60" />
        <div className="absolute left-0 top-0 z-[2] h-[190px] w-[250px] rounded-2xl border border-white/60 bg-white/90 p-4 shadow-[0_24px_45px_-28px_rgba(2,8,23,0.7)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">今日推薦任務</span>
            <span className="text-[10px] text-slate-400">3 / 5</span>
          </div>

          <div className="mb-2 h-2.5 w-44 rounded bg-slate-300/85" />
          <div className="mb-4 h-2.5 w-52 rounded bg-slate-200/90" />

          <div className="mb-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border border-emerald-500 bg-emerald-500/20" />
              <span className="h-2.5 w-40 rounded bg-slate-200" />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border border-emerald-500 bg-emerald-500/20" />
              <span className="h-2.5 w-36 rounded bg-slate-100" />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border border-slate-300 bg-white" />
              <span className="h-2.5 w-32 rounded bg-slate-100" />
            </div>
          </div>

          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={cn("h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500", !reduceMotion && "animate-[qwen-progress-run_4.8s_ease-in-out_infinite]")} />
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>填答進度</span>
            <span>品質分 92</span>
          </div>
        </div>

        <div className={cn("absolute -right-1 top-4 z-[3] rounded-xl border border-orange-200/80 bg-white/90 px-3 py-2 shadow-lg", !reduceMotion && "animate-[qwen-reward-pop_3s_ease-in-out_infinite]")}>
          <div className="text-[10px] font-semibold text-orange-600">+30 點</div>
          <div className="text-[9px] text-slate-500">完成回饋</div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  desc,
  immersive,
  index = 0,
  motionMode = "full",
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  immersive?: boolean;
  index?: number;
  motionMode?: "full" | "lite" | "minimal";
}) {
  return (
    <div
      className={cn(
        "group flex max-w-[500px] items-center gap-3.5 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3.5 backdrop-blur-sm transition-transform duration-500",
        motionMode === "full" && "animate-[qwen-card-breathe_6.8s_ease-in-out_infinite]"
      )}
      style={immersive ? { transform: "translateZ(0)", animationDelay: `${index * 180}ms` } : { animationDelay: `${index * 180}ms` }}
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 text-white transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:rotate-3"
        style={immersive ? { transform: "translateZ(28px)" } : undefined}
      >
        {icon}
      </div>
      <div style={immersive ? { transform: "translateZ(16px)" } : undefined}>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs opacity-80">{desc}</div>
      </div>
    </div>
  );
}

function CinematicDust() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      <div className="absolute left-[16%] top-[14%] h-1.5 w-1.5 rounded-full bg-white/70 animate-[qwen-node-drift_4.4s_ease-in-out_infinite]" />
      <div className="absolute left-[42%] top-[21%] h-1 w-1 rounded-full bg-cyan-100/80 animate-[qwen-node-drift_5.8s_ease-in-out_infinite]" />
      <div className="absolute left-[68%] top-[33%] h-1.5 w-1.5 rounded-full bg-amber-100/80 animate-[qwen-node-drift_6.1s_ease-in-out_infinite]" />
      <div className="absolute left-[24%] top-[58%] h-1 w-1 rounded-full bg-white/70 animate-[qwen-node-drift_4.9s_ease-in-out_infinite]" />
      <div className="absolute left-[62%] top-[72%] h-1.5 w-1.5 rounded-full bg-cyan-100/80 animate-[qwen-node-drift_6.4s_ease-in-out_infinite]" />
    </div>
  );
}
