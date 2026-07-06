'use client';

export const dynamic = 'force-static';
export const dynamicParams = false;

import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Gift,
  LinkIcon,
  SearchX,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { SurveyModel } from 'survey-core';
import { usePublicSurvey, useSubmitResponse } from '@/hooks/use-responses';
import { BehaviorTracker, detectIntervention } from '@/lib/behavior-tracker';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND, darkenHex, fontFamilyClass } from '@/components/survey-editor/survey-style-panel';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import type { AnswerInput } from '@/hooks/use-responses';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';
import { SidebarNav } from '@/components/survey-glass/sidebar-nav';

// ─── Light Glass design primitives ──────────────────────────────────────────

const GLASS_CARD: CSSProperties = {
  background: '#ffffff',
  backdropFilter: 'blur(20px) saturate(180%)',
  boxShadow:
    '0 1px 3px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
};

function GlassShell({
  children,
  bgColor,
  accentColor,
  accentDark,
}: {
  children: ReactNode;
  bgColor?: string;
  accentColor?: string;
  accentDark?: string;
}) {
  const mainStyle: CSSProperties = {
    background: bgColor ?? '#f1f5f9',
    ...(accentColor ? { '--qw-accent': accentColor } as CSSProperties : {}),
    ...(accentDark ? { '--qw-accent-dark': accentDark } as CSSProperties : {}),
  };
  return (
    <main className="relative min-h-[100dvh] overflow-clip text-[#0f172a]" style={mainStyle}>
      {/* Decorative orb 1 — top-left */}
      <div
        className="pointer-events-none absolute -top-48 -left-48 h-[600px] w-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      {/* Decorative orb 2 — bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 h-[400px] w-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(96,165,250,0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </div>
      {/* Bottom padding for mobile bottom bar */}
      <div className="h-16 md:hidden" />
    </main>
  );
}

function GlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[20px] border p-6 sm:p-8 ${className}`}
      style={{ ...GLASS_CARD, borderColor: 'rgba(15,23,42,0.1)' }}
    >
      {children}
    </div>
  );
}

function GlassButton({
  children,
  onClick,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'warm';
  className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2';
  const variants: Record<string, string> = {
    primary: 'text-white',
    ghost: 'border border-[rgba(0,0,0,0.12)] bg-white text-[#0f172a] hover:bg-[#f1f5f9]',
    warm: 'border border-amber-400/40 bg-amber-50 text-amber-700 hover:bg-amber-100',
  };
  const primaryStyle: CSSProperties | undefined =
    variant === 'primary' ? { background: 'var(--qw-accent)' } : undefined;
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} style={primaryStyle}>
      {children}
    </button>
  );
}

function GlassPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warm';
}) {
  const baseClass = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium';
  if (tone === 'accent') {
    return (
      <span
        className={baseClass}
        style={{
          borderColor: 'color-mix(in srgb, var(--qw-accent) 20%, transparent)',
          background: 'color-mix(in srgb, var(--qw-accent) 10%, transparent)',
          color: 'var(--qw-accent)',
        }}
      >
        {children}
      </span>
    );
  }
  const tones: Record<string, string> = {
    warm: 'border-amber-400/30 bg-amber-50 text-amber-700',
    neutral: 'border-[rgba(0,0,0,0.08)] bg-[#f8fafc] text-[#475569]',
  };
  return (
    <span
      className={`${baseClass} ${tones[tone] ?? ''}`}
    >
      {children}
    </span>
  );
}

function GlassIconCircle({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'gray' }) {
  if (tone === 'blue') {
    return (
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: 'color-mix(in srgb, var(--qw-accent) 10%, transparent)',
          color: 'var(--qw-accent)',
        }}
      >
        {children}
      </div>
    );
  }
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    gray: 'bg-[#f1f5f9] text-[#475569]',
  };
  return (
    <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${tones[tone] ?? ''}`}>
      {children}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SurveyFillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: survey, isLoading } = usePublicSurvey(id);
  const submitResponse = useSubmitResponse(id);

  // 問卷主題：建立者設定的色彩與字型
  const accent = survey?.theme?.accentColor ?? DEFAULT_ACCENT;
  const accentDark = darkenHex(accent);
  const bg = survey?.theme?.backgroundColor ?? DEFAULT_BACKGROUND;
  const themeProps = { bgColor: bg, accentColor: accent, accentDark };

  const startedAtRef = useRef<string>(new Date().toISOString());
  const trackerRef = useRef<BehaviorTracker | null>(null);
  const [interventionMsg, setInterventionMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [surveyModel, setSurveyModel] = useState<SurveyModel | null>(null);

  // Track answered count for header progress
  const [answeredCount, setAnsweredCount] = useState(0);
  const totalQuestions = survey?.questions?.length ?? 0;

  useEffect(() => {
    trackerRef.current = new BehaviorTracker();
    const interval = setInterval(() => {
      const t = trackerRef.current;
      if (!t) return;
      const snapshot = t.dump();
      const intv = detectIntervention(snapshot);
      if (intv) setInterventionMsg(intv.message);
    }, 8_000);
    return () => {
      clearInterval(interval);
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, []);

  // Sync answered count from SurveyJS model
  useEffect(() => {
    if (!surveyModel) return;
    const update = () => {
      const qs = surveyModel.getAllQuestions();
      setAnsweredCount(qs.filter((q) => !q.isEmpty()).length);
    };
    update();
    surveyModel.onValueChanged.add(update);
    return () => {
      surveyModel.onValueChanged.remove(update);
    };
  }, [surveyModel]);

  const handleSubmit = async (answers: AnswerInput[]) => {
    const behaviorLog = trackerRef.current?.dump();
    try {
      const result = await submitResponse.mutateAsync({
        answers,
        startedAt: startedAtRef.current,
        behaviorLog,
      });
      setFlagged(result.flagged);
      setSubmitted(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setSubmitted(true);
      }
    }
  };

  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // ── Loading ──
  if (isLoading) {
    return (
      <GlassShell {...themeProps}>
        <div className="mx-auto mt-24 flex w-full max-w-sm items-center justify-center rounded-[20px] border p-8 text-sm text-[#07183d]"
          style={{ ...GLASS_CARD, borderColor: 'rgba(15,23,42,0.1)' }}
        >
          <span className="mr-3 h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--qw-accent)' }} />
          載入問卷中…
        </div>
      </GlassShell>
    );
  }

  // ── Not found ──
  if (!survey) {
    return (
      <GlassShell {...themeProps}>
        <GlassCard className="mx-auto mt-16 max-w-md text-center">
          <GlassIconCircle tone="gray">
            <SearchX className="h-5 w-5" strokeWidth={1.8} />
          </GlassIconCircle>
          <h1 className="text-xl font-semibold tracking-tight">問卷不存在或尚未上架</h1>
          <p className="mt-2 text-sm leading-6 text-[#475569]">這份問卷可能已截止或被下架。</p>
          <div className="mt-6">
            <GlassButton onClick={() => router.push('/tasks')}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              回到問卷列表
            </GlassButton>
          </div>
        </GlassCard>
      </GlassShell>
    );
  }

  // ── External survey ──
  if (survey.externalUrl) {
    return (
      <GlassShell {...themeProps}>
        <GlassCard className="mx-auto mt-10 text-center">
          <GlassIconCircle tone="blue">
            <LinkIcon className="h-6 w-6" strokeWidth={1.8} />
          </GlassIconCircle>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--qw-accent)' }}>External survey</p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#0f172a]">{survey.title}</h1>
          {survey.description && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#475569]">{survey.description}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            {survey.estimatedMinutes ? (
              <GlassPill>
                <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                約 {survey.estimatedMinutes} 分鐘
              </GlassPill>
            ) : null}
            <GlassPill tone="warm">
              <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
              {survey.rewardMode === 'lottery' ? `抽 ${survey.lotteryPrize ?? '獎品'}` : `NT$${survey.rewardPoints}`}
            </GlassPill>
          </div>
          <div className="mt-7 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-700">
            這份問卷在外部平台（例如 Google 表單）填寫。點擊下方按鈕會在新分頁開啟，請依問卷說明完成填答。
            <br />
            獎勵由問卷建立者依其填答結果發放。
          </div>
          <div className="mt-7">
            <a
              href={survey.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GlassButton>
                前往填寫問卷
                <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
              </GlassButton>
            </a>
          </div>
          <div className="mt-4">
            <button
              onClick={() => router.push('/tasks')}
              className="inline-flex items-center gap-1.5 text-sm text-[#475569] transition hover:text-[#0f172a]"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              回到問卷列表
            </button>
          </div>
        </GlassCard>
      </GlassShell>
    );
  }

  // ── Submitted / already submitted ──
  if (submitted || survey.alreadySubmitted) {
    const justSubmitted = submitted;
    return (
      <GlassShell {...themeProps}>
        <GlassCard className="mx-auto mt-12 max-w-lg text-center">
          <GlassIconCircle tone={flagged ? 'amber' : justSubmitted ? 'blue' : 'gray'}>
            {flagged ? (
              <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
            ) : justSubmitted ? (
              <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
            ) : (
              <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
            )}
          </GlassIconCircle>
          <h1 className="mb-2 text-3xl font-semibold tracking-[-0.03em]">
            {justSubmitted
              ? flagged
                ? '填答已記錄'
                : '填答已送出！'
              : '您已填過此問卷'}
          </h1>
          {flagged && (
            <p className="mb-4 text-sm leading-6 text-amber-600">
              系統偵測到填答異常，請確保認真作答以維持您的信譽分數。
            </p>
          )}
          {justSubmitted && !flagged && survey.rewardPoints > 0 && (
            <p className="mb-6 text-[#475569]">
              NT${survey.rewardPoints} 獎勵將在審核後發放至您的帳戶。
            </p>
          )}
          {justSubmitted && !flagged && survey.rewardMode === 'lottery' && (
            <p className="mb-6 text-[#475569]">
              品質審核通過後，您會取得「{survey.lotteryPrize}」抽獎資格，開獎後會收到系統通知。
            </p>
          )}
          {justSubmitted && survey.thankYouMessage && (
            <p className="mx-auto mb-4 max-w-md whitespace-pre-wrap text-sm leading-7 text-[#475569]">
              {survey.thankYouMessage}
            </p>
          )}
          {justSubmitted && (survey.thankYouImages?.length ?? 0) > 0 && (
            <div className="mx-auto mb-6 max-w-md space-y-3">
              {survey.thankYouImages!.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={resolveAssetUrl(url)}
                  alt={`感謝頁圖片 ${i + 1}`}
                  className="w-full rounded-2xl border border-[rgba(0,0,0,0.08)] object-contain"
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {justSubmitted && survey.thankYouRedirectUrl && (
              <a
                href={survey.thankYouRedirectUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GlassButton variant="ghost">
                  前往指定頁面
                  <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                </GlassButton>
              </a>
            )}
            <GlassButton onClick={() => router.push('/tasks')}>
              回到問卷列表
            </GlassButton>
            {justSubmitted && !flagged && (
              <GlassButton variant="warm" onClick={() => router.push('/spin')}>
                <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                前往轉盤
              </GlassButton>
            )}
          </div>
        </GlassCard>
      </GlassShell>
    );
  }

  // ── Active survey (main fill view) ──
  return (
    <GlassShell {...themeProps}>
      <div className={fontFamilyClass(survey.theme?.fontFamily)}>
        {/* Header bar */}
        <header className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--qw-accent) 10%, transparent)' }}
            >
              <span className="text-sm font-bold" style={{ color: 'var(--qw-accent)' }}>卷</span>
            </div>
            <span className="text-base font-semibold text-[#0f172a]">卷問</span>
          </div>
          {/* Top progress bar */}
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'var(--qw-accent)',
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--qw-accent) 30%, transparent)',
                  transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--qw-accent)' }}>{progressPct}%</span>
          </div>
          <button
            onClick={() => router.back()}
            className="shrink-0 rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
          >
            返回
          </button>
        </header>

        {/* Main content + sidebar layout */}
        <div className="flex gap-6">
          {/* Left: survey content */}
          <div className="min-w-0 flex-1">
            {/* Survey info card */}
            <GlassCard>
              {survey.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveAssetUrl(survey.coverImageUrl)}
                  alt=""
                  className="mb-5 max-h-72 w-full rounded-xl object-cover"
                />
              )}
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--qw-accent)' }}>QuanWen survey</p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#0f172a] sm:text-4xl">{survey.title}</h1>
              {survey.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#475569]">{survey.description}</p>
              )}
              {survey.welcomeImages && survey.welcomeImages.length > 0 && (
                <div className="mt-5 space-y-3">
                  {survey.welcomeImages.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${url}-${i}`}
                      src={resolveAssetUrl(url)}
                      alt={`歡迎圖 ${i + 1}`}
                      className="w-full rounded-2xl border border-[rgba(0,0,0,0.08)] object-contain"
                    />
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {survey.rewardPoints > 0 && (
                  <GlassPill tone="accent">
                    <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
                    獎勵 NT${survey.rewardPoints}
                  </GlassPill>
                )}
                {survey.rewardMode === 'lottery' && (
                  <GlassPill tone="warm">
                    <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
                    抽獎：{survey.lotteryPrize}
                  </GlassPill>
                )}
                {survey.isAnonymous && (
                  <GlassPill>
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
                    匿名填答
                  </GlassPill>
                )}
                <GlassPill>
                  <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {survey.questions.length} 題
                </GlassPill>
                {survey.questions.length > 0 && (
                  <GlassPill>
                    <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    預估約 {estimateFillMinutes(survey.questions.length)} 分鐘
                  </GlassPill>
                )}
              </div>
            </GlassCard>

            {/* Lottery disclosure */}
            {survey.rewardMode === 'lottery' && (
              <div className="my-5 rounded-xl border border-amber-300/40 bg-amber-50 p-4 text-xs leading-6 text-amber-700"
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}
              >
                <p className="font-semibold">抽獎規則：{lotteryDisclosure(survey)}</p>
                <p className="mt-1">平台追蹤：建立者已接受開獎後七日內交付獎品條款。平台會留存通知、中獎者確認與未收到回報，必要時介入處理並核驗履約紀錄。</p>
              </div>
            )}

            {/* Intervention message */}
            {interventionMsg && (
              <div className="my-5 flex items-start justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3">
                <div className="flex gap-2 text-sm leading-6 text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span>{interventionMsg}</span>
                </div>
                <button
                  onClick={() => setInterventionMsg(null)}
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-amber-600 transition hover:bg-amber-100"
                >
                  知道了
                </button>
              </div>
            )}

            {/* Submit error */}
            {submitResponse.error && (() => {
              const err = submitResponse.error as { response?: { data?: { message?: string }; status?: number }; message?: string };
              const backendMsg = err?.response?.data?.message;
              const status = err?.response?.status;
              return (
                <p className="my-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {status === 409 ? '您已填寫過此問卷'
                    : status === 401 ? '請重新登入'
                    : status === 403 ? backendMsg ?? '權限不足'
                    : status === 400 ? backendMsg ?? '送出資料有誤'
                    : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
                </p>
              );
            })()}

            {/* SurveyJS Renderer (light glass themed) */}
            <SurveyRendererSurveyJS
              survey={survey}
              onSubmit={handleSubmit}
              submitting={submitResponse.isPending}
              onModelReady={setSurveyModel}
            />
          </div>

          {/* Right: Sidebar navigation */}
          <SidebarNav model={surveyModel} />
        </div>
      </div>
    </GlassShell>
  );
}
