'use client';

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
import { DEFAULT_BACKGROUND, fontFamilyClass } from '@/components/survey-editor/survey-style-panel';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import type { AnswerInput } from '@/hooks/use-responses';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';
import { SidebarNav } from '@/components/survey-glass/sidebar-nav';

// ─── Glass design primitives ────────────────────────────────────────────────

const GLASS_BG: CSSProperties = {
  background: 'linear-gradient(135deg, #07183d 0%, #001a33 50%, #0f172a 100%)',
};

const GLASS_CARD: CSSProperties = {
  background:
    'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(37,99,235,0.12) 100%)',
  backdropFilter: 'blur(20px) saturate(180%)',
  boxShadow:
    '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
};

function GlassShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden text-white" style={GLASS_BG}>
      {/* Glow orb 1 — top-left */}
      <div
        className="pointer-events-none absolute -top-48 -left-48 h-[600px] w-[600px] rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      {/* Glow orb 2 — bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 h-[400px] w-[400px] rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(96,165,250,0.2) 0%, transparent 70%)',
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
      className={`rounded-[20px] border border-white/15 p-6 sm:p-8 ${className}`}
      style={GLASS_CARD}
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
  const base = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40';
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(37,99,235,0.4)]',
    ghost:
      'border border-white/15 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white',
    warm:
      'border border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  };
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
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
  const tones: Record<string, string> = {
    accent: 'border-blue-400/30 bg-blue-500/15 text-blue-300',
    warm: 'border-amber-400/30 bg-amber-500/15 text-amber-300',
    neutral: 'border-white/10 bg-white/5 text-gray-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function GlassIconCircle({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'gray' }) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-500/15 text-blue-300',
    amber: 'bg-amber-500/15 text-amber-300',
    gray: 'bg-white/10 text-gray-400',
  };
  return (
    <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${tones[tone]}`}>
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
      <GlassShell>
        <div className="mx-auto mt-24 flex w-full max-w-sm items-center justify-center rounded-[20px] border border-white/15 p-8 text-sm text-blue-300"
          style={GLASS_CARD}
        >
          <span className="mr-3 h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
          載入問卷中…
        </div>
      </GlassShell>
    );
  }

  // ── Not found ──
  if (!survey) {
    return (
      <GlassShell>
        <GlassCard className="mx-auto mt-16 max-w-md text-center">
          <GlassIconCircle tone="gray">
            <SearchX className="h-5 w-5" strokeWidth={1.8} />
          </GlassIconCircle>
          <h1 className="text-xl font-semibold tracking-tight">問卷不存在或尚未上架</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">這份問卷可能已截止或被下架。</p>
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
      <GlassShell>
        <GlassCard className="mx-auto mt-10 text-center">
          <GlassIconCircle tone="blue">
            <LinkIcon className="h-6 w-6" strokeWidth={1.8} />
          </GlassIconCircle>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-blue-400">External survey</p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{survey.title}</h1>
          {survey.description && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-400">{survey.description}</p>
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
          <div className="mt-7 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-left text-xs leading-relaxed text-amber-200">
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
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
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
      <GlassShell>
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
            <p className="mb-4 text-sm leading-6 text-amber-300">
              系統偵測到填答異常，請確保認真作答以維持您的信譽分數。
            </p>
          )}
          {justSubmitted && !flagged && survey.rewardPoints > 0 && (
            <p className="mb-6 text-gray-400">
              NT${survey.rewardPoints} 獎勵將在審核後發放至您的帳戶。
            </p>
          )}
          {justSubmitted && !flagged && survey.rewardMode === 'lottery' && (
            <p className="mb-6 text-gray-400">
              品質審核通過後，您會取得「{survey.lotteryPrize}」抽獎資格，開獎後會收到系統通知。
            </p>
          )}
          {justSubmitted && survey.thankYouMessage && (
            <p className="mx-auto mb-4 max-w-md whitespace-pre-wrap text-sm leading-7 text-gray-300">
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
                  className="w-full rounded-2xl border border-white/10 object-contain"
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
    <GlassShell>
      <div className={fontFamilyClass(survey.theme?.fontFamily)}>
        {/* Header bar */}
        <header className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
              <span className="text-sm font-bold text-blue-400">卷</span>
            </div>
            <span className="text-base font-semibold text-white">卷問</span>
          </div>
          {/* Top progress bar */}
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                  boxShadow: '0 0 10px rgba(37,99,235,0.5)',
                  transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-blue-300">{progressPct}%</span>
          </div>
          <button
            onClick={() => router.back()}
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-white/10 hover:text-white"
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-blue-400">QuanWen survey</p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{survey.title}</h1>
              {survey.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-400">{survey.description}</p>
              )}
              {survey.welcomeImages && survey.welcomeImages.length > 0 && (
                <div className="mt-5 space-y-3">
                  {survey.welcomeImages.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${url}-${i}`}
                      src={resolveAssetUrl(url)}
                      alt={`歡迎圖 ${i + 1}`}
                      className="w-full rounded-2xl border border-white/10 object-contain"
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
              <div className="my-5 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-xs leading-6 text-amber-200"
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
              >
                <p className="font-semibold">抽獎規則：{lotteryDisclosure(survey)}</p>
                <p className="mt-1">平台追蹤：建立者已接受開獎後七日內交付獎品條款。平台會留存通知、中獎者確認與未收到回報，必要時介入處理並核驗履約紀錄。</p>
              </div>
            )}

            {/* Intervention message */}
            {interventionMsg && (
              <div className="my-5 flex items-start justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                <div className="flex gap-2 text-sm leading-6 text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span>{interventionMsg}</span>
                </div>
                <button
                  onClick={() => setInterventionMsg(null)}
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
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
                <p className="my-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {status === 409 ? '您已填寫過此問卷'
                    : status === 401 ? '請重新登入'
                    : status === 403 ? backendMsg ?? '權限不足'
                    : status === 400 ? backendMsg ?? '送出資料有誤'
                    : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
                </p>
              );
            })()}

            {/* SurveyJS Renderer (dark glass themed) */}
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
