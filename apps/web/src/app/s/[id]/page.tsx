'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Gift,
  LogIn,
  SearchX,
} from 'lucide-react';
import type { SurveyModel } from 'survey-core';
import { usePublicLinkSurvey, useSubmitPublicResponse } from '@/hooks/use-responses';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND, darkenHex, fontFamilyClass } from '@/components/survey-editor/survey-style-panel';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import { getToken } from '@/lib/token';
import { SidebarNav } from '@/components/survey-glass/sidebar-nav';

const ANON_KEY = 'quanwen_anon_token_v1';

function PublicSurveyShell({
  children,
  className = '',
  style,
  wide = false,
  accentColor,
  accentDark,
  bgColor,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  wide?: boolean;
  accentColor?: string;
  accentDark?: string;
  bgColor?: string;
}) {
  const shellStyle: CSSProperties = {
    background: bgColor ?? '#f7f8f8',
    ...(accentColor ? { '--qw-accent': accentColor } as CSSProperties : {}),
    ...(accentDark ? { '--qw-accent-dark': accentDark } as CSSProperties : {}),
    ...style,
  };
  return (
    <main
      className={`relative min-h-[100dvh] overflow-hidden px-4 py-6 text-slate-950 sm:px-6 sm:py-10 ${className}`}
      style={shellStyle}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_20%,rgba(18,107,138,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className={`relative mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</div>
      {/* Bottom padding for mobile bottom bar */}
      {wide && <div className="h-16 md:hidden" />}
    </main>
  );
}

function PublicMetaPill({
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
  const toneClass =
    tone === 'warm'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-white/70 text-slate-600';
  return (
    <span className={`${baseClass} ${toneClass}`}>
      {children}
    </span>
  );
}

function getAnonToken() {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(ANON_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(ANON_KEY, token);
  }
  return token;
}

export default function PublicSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const anonToken = useMemo(() => getAnonToken(), []);
  const startedAtRef = useRef<string>(new Date().toISOString());
  const { data: survey, isLoading } = usePublicLinkSurvey(id);
  const submit = useSubmitPublicResponse(id, anonToken);

  const [done, setDone] = useState<{ flagged: boolean } | null>(null);
  const [surveyModel, setSurveyModel] = useState<SurveyModel | null>(null);
  // 登入偵測放 useEffect，避免 SSR/CSR 不一致造成 hydration mismatch
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => setHasToken(!!getToken()), []);

  // 問卷主題：建立者設定的色彩與字型
  const accent = survey?.theme?.accentColor ?? DEFAULT_ACCENT;
  const accentDark = darkenHex(accent);
  const bg = survey?.theme?.backgroundColor ?? DEFAULT_BACKGROUND;
  const themeProps = { accentColor: accent, accentDark, bgColor: bg };

  if (isLoading) {
    return (
      <PublicSurveyShell {...themeProps}>
        <div className="mx-auto mt-24 flex w-full max-w-sm items-center justify-center rounded-3xl border border-slate-200 bg-white/80 p-8 text-sm text-slate-500 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <LoadingSpinner />
          <span className="ml-3">載入問卷中…</span>
        </div>
      </PublicSurveyShell>
    );
  }
  if (!survey)
    return (
      <PublicSurveyShell {...themeProps}>
        <div className="mx-auto mt-16 max-w-md rounded-[28px] border border-slate-200 bg-white/88 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <SearchX className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">找不到這份問卷</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">問卷可能已下架、截止，或連結有誤。</p>
        <Link
          href="/auth/register"
          className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2"
          style={{ background: 'var(--qw-accent)' }}
        >
          免費註冊券問，填問卷賺獎勵
        </Link>
        </div>
      </PublicSurveyShell>
    );
  if (survey.rewardMode === 'lottery') {
    return (
      <PublicSurveyShell {...themeProps}>
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/88 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          {survey.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAssetUrl(survey.coverImageUrl)}
              alt=""
              className="max-h-72 w-full object-cover"
            />
          )}
          <div className="p-5 sm:p-7">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--qw-accent)' }}>QuanWen survey</p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{survey.title}</h1>
            {survey.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-500">{survey.description}</p>
            )}
            {survey.welcomeImages && survey.welcomeImages.length > 0 && (
              <div className="mt-5 space-y-3">
                {survey.welcomeImages.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${i}`}
                    src={resolveAssetUrl(url)}
                    alt={`歡迎圖 ${i + 1}`}
                    className="w-full rounded-2xl border border-slate-100 object-contain"
                  />
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <PublicMetaPill>
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
                {survey.questions.length} 題
              </PublicMetaPill>
              {survey.questions.length > 0 && (
                <PublicMetaPill>
                  <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  預估約 {estimateFillMinutes(survey.questions.length)} 分鐘
                </PublicMetaPill>
              )}
            </div>
          </div>
        </section>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm leading-6 text-amber-900 shadow-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Gift className="h-4 w-4" strokeWidth={1.8} />
            抽獎回饋：{survey.lotteryPrize}
          </p>
          <p className="mt-1">抽獎規則：{lotteryDisclosure(survey)}</p>
        </div>
        <div className="mt-5 rounded-[28px] border border-slate-200 bg-white/88 p-5 text-center shadow-[0_16px_60px_rgba(15,23,42,0.07)] backdrop-blur">
          <p className="text-sm leading-6 text-slate-500">
            {hasToken
              ? '你已登入券問，前往填答即可參與抽獎。'
              : '需要登入券問帳號填答，系統才能在開獎後通知你是否中獎。'}
          </p>
          <Link
            href={hasToken ? `/tasks/${id}` : `/auth/login?redirect=${encodeURIComponent(`/tasks/${id}`)}`}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2"
            style={{ background: 'var(--qw-accent)' }}
          >
            <LogIn className="h-4 w-4" strokeWidth={1.8} />
            {hasToken ? '前往填答參與抽獎' : '登入後參與抽獎'}
          </Link>
          {!hasToken && (
            <p className="mt-3 text-xs text-slate-500">
              還沒有帳號？
              <Link href="/auth/register" className="ml-1 font-medium hover:underline" style={{ color: 'var(--qw-accent)' }}>
                免費註冊
              </Link>
            </p>
          )}
        </div>
      </PublicSurveyShell>
    );
  }

  if (done || survey.alreadySubmitted) {
    return (
      <PublicSurveyShell {...themeProps}>
        <div className="mx-auto mt-12 rounded-[32px] border border-slate-200 bg-white/88 p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={done?.flagged
            ? { background: 'rgb(254 243 199)', color: 'rgb(180 83 9)' }
            : { background: 'color-mix(in srgb, var(--qw-accent) 10%, transparent)', color: 'var(--qw-accent)' }
          }
        >
          {done?.flagged ? (
            <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
          ) : (
            <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">{done ? (done.flagged ? 'AI 審核中' : '填答已送出') : '已完成'}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500">
          {done
            ? '您的填答正在進行品質審核，審核通過後將發放獎勵。'
            : `填答完成。獎勵金額：NT$${survey.rewardPoints}。`}
        </p>
        {/* 建立者自訂的感謝頁內容（結束設定） */}
        {done && survey.thankYouMessage && (
          <p className="mx-auto mt-4 max-w-md whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {survey.thankYouMessage}
          </p>
        )}
        {done && (survey.thankYouImages?.length ?? 0) > 0 && (
          <div className="mx-auto mt-4 max-w-md space-y-3">
            {survey.thankYouImages!.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={resolveAssetUrl(url)}
                alt={`感謝頁圖片 ${i + 1}`}
                className="w-full rounded-2xl border border-slate-100 object-contain"
              />
            ))}
          </div>
        )}
        {done && survey.thankYouRedirectUrl && (
          <a
            href={survey.thankYouRedirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2.5 text-sm font-semibold transition hover:opacity-80"
            style={{
              borderColor: 'color-mix(in srgb, var(--qw-accent) 30%, transparent)',
              color: 'var(--qw-accent)',
            }}
          >
            前往指定頁面
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
          </a>
        )}
        <div
          className="mt-6 rounded-2xl p-4"
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'color-mix(in srgb, var(--qw-accent) 20%, transparent)',
            background: 'color-mix(in srgb, var(--qw-accent) 5%, transparent)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--qw-accent)' }}>想填更多問卷賺獎勵，或自己發問卷找受試者？</p>
          <Link
            href="/auth/register"
            className="mt-3 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            style={{ background: 'var(--qw-accent)' }}
          >
            免費註冊券問
          </Link>
        </div>
        </div>
      </PublicSurveyShell>
    );
  }

  const handleSubmit = async (answers: Array<{ questionId: string; textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>) => {
    try {
      const result = await submit.mutateAsync({
        answers,
        startedAt: startedAtRef.current,
      });
      setDone({ flagged: result.flagged });
    } catch {
      // 錯誤透過 submit.error 顯示於下方，避免未處理的 rejection 卡住表單
    }
  };

  return (
    <PublicSurveyShell wide {...themeProps}>
      <div className={`flex gap-6 ${fontFamilyClass(survey.theme?.fontFamily)}`}>
        {/* Left: survey content */}
        <div className="min-w-0 flex-1">
          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/88 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            {survey.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveAssetUrl(survey.coverImageUrl)}
                alt=""
                className="max-h-72 w-full object-cover"
              />
            )}
            <div className="p-5 sm:p-7">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--qw-accent)' }}>QuanWen survey</p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{survey.title}</h1>
              {survey.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-500">{survey.description}</p>
              )}
              {survey.welcomeImages && survey.welcomeImages.length > 0 && (
                <div className="mt-5 space-y-3">
                  {survey.welcomeImages.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${url}-${i}`}
                      src={resolveAssetUrl(url)}
                      alt={`歡迎圖 ${i + 1}`}
                      className="w-full rounded-2xl border border-slate-100 object-contain"
                    />
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <PublicMetaPill>
                  <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {survey.questions.length} 題
                </PublicMetaPill>
                {survey.questions.length > 0 && (
                  <PublicMetaPill>
                    <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    預估約 {estimateFillMinutes(survey.questions.length)} 分鐘
                  </PublicMetaPill>
                )}
                {survey.rewardPoints > 0 && (
                  <PublicMetaPill tone="accent">
                    <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
                    NT${survey.rewardPoints}
                  </PublicMetaPill>
                )}
              </div>
            </div>
          </section>
          {submit.error && (() => {
            const err = submit.error as { response?: { data?: { message?: string }; status?: number }; message?: string };
            const status = err?.response?.status;
            const backendMsg = err?.response?.data?.message;
            return (
              <p className="my-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {status === 409 ? '這份問卷你已經填過了'
                  : status === 400 ? backendMsg ?? '送出資料有誤，請檢查後重試'
                  : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
              </p>
            );
          })()}
          <SurveyRendererSurveyJS
            survey={survey}
            onSubmit={handleSubmit}
            submitting={submit.isPending}
            onModelReady={setSurveyModel}
          />
        </div>

        {/* Right: sticky progress sidebar */}
        <SidebarNav model={surveyModel} />
      </div>
    </PublicSurveyShell>
  );
}
