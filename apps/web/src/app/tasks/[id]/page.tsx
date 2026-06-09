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
import { usePublicSurvey, useSubmitResponse } from '@/hooks/use-responses';
import { BehaviorTracker, detectIntervention } from '@/lib/behavior-tracker';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import { DEFAULT_BACKGROUND, fontFamilyClass } from '@/components/survey-editor/survey-style-panel';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import type { AnswerInput } from '@/hooks/use-responses';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';

function SurveyShell({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <main
      className={`relative min-h-[100dvh] overflow-hidden bg-[#f7f8f8] px-4 py-6 text-slate-950 sm:px-6 sm:py-10 ${className}`}
      style={style}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_20%,rgba(18,107,138,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className="relative mx-auto w-full max-w-3xl">{children}</div>
    </main>
  );
}

function MetaPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warm';
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-[#126b8a]/20 bg-[#126b8a]/10 text-[#0f5d78]'
      : tone === 'warm'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-white/70 text-slate-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export default function SurveyFillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: survey, isLoading } = usePublicSurvey(id);
  const submitResponse = useSubmitResponse(id);

  // 記錄頁面載入時間，用於反作弊計算
  const startedAtRef = useRef<string>(new Date().toISOString());

  // Phase 2: BehaviorTracker（mount 時建，unmount 時 dispose）
  const trackerRef = useRef<BehaviorTracker | null>(null);
  const [interventionMsg, setInterventionMsg] = useState<string | null>(null);

  useEffect(() => {
    trackerRef.current = new BehaviorTracker();
    // 每 8 秒檢查一次是否需要干預
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

  const [submitted, setSubmitted] = useState(false);
  const [flagged, setFlagged] = useState(false);

  const handleSubmit = async (answers: AnswerInput[]) => {
    // dump tracker 為一個快照（含 perQuestionTimeMs、windowSwitch、paste 等）
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
        // 已經填過 → 視同已完成
        setSubmitted(true);
      }
    }
  };

  if (isLoading) {
    return (
      <SurveyShell>
        <div className="mx-auto mt-24 flex w-full max-w-sm items-center justify-center rounded-3xl border border-slate-200 bg-white/80 p-8 text-sm text-slate-500 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <span className="mr-3 h-2.5 w-2.5 animate-pulse rounded-full bg-[#126b8a]" />
          載入問卷中…
        </div>
      </SurveyShell>
    );
  }
  if (!survey)
    return (
      <SurveyShell>
        <div className="mx-auto mt-16 max-w-md rounded-[28px] border border-slate-200 bg-white/88 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <SearchX className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">問卷不存在或尚未上架</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">這份問卷可能已截止或被下架。</p>
        <button
          onClick={() => router.push('/tasks')}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#126b8a] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f5d78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126b8a]/30"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          回到問卷列表
        </button>
        </div>
      </SurveyShell>
    );

  // 外部問卷：站內無題目，顯示跳轉頁，引導填答者前往外部平台填寫
  if (survey.externalUrl) {
    return (
      <SurveyShell>
        <div className="mx-auto mt-10 rounded-[32px] border border-slate-200 bg-white/88 p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#126b8a]/10 text-[#126b8a]">
            <LinkIcon className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">External survey</p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">{survey.title}</h1>
          {survey.description && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">{survey.description}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            {survey.estimatedMinutes ? (
              <MetaPill>
                <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                約 {survey.estimatedMinutes} 分鐘
              </MetaPill>
            ) : null}
            <MetaPill tone="warm">
              <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
              {survey.rewardMode === 'lottery' ? `抽 ${survey.lotteryPrize ?? '獎品'}` : `NT$${survey.rewardPoints}`}
            </MetaPill>
          </div>
          <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-left text-xs leading-relaxed text-amber-900">
            這份問卷在外部平台（例如 Google 表單）填寫。點擊下方按鈕會在新分頁開啟，請依問卷說明完成填答。
            <br />
            獎勵由問卷建立者依其填答結果發放。
          </div>
          <a
            href={survey.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#126b8a] px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f5d78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126b8a]/30"
          >
            前往填寫問卷
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
          </a>
          <div className="mt-4">
            <button
              onClick={() => router.push('/tasks')}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              回到問卷列表
            </button>
          </div>
        </div>
      </SurveyShell>
    );
  }

  if (submitted || survey.alreadySubmitted) {
    // 注意：submitted（本次剛送出）優先於 alreadySubmitted —
    // 送出後 query invalidation 會讓 alreadySubmitted 變 true，
    // 若以它優先判斷，感謝畫面會在 0.5 秒內被翻成「您已填過此問卷」。
    const justSubmitted = submitted;
    return (
      <SurveyShell>
        <div className="mx-auto mt-12 rounded-[32px] border border-slate-200 bg-white/88 p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
          flagged ? 'bg-amber-100 text-amber-700' : justSubmitted ? 'bg-[#126b8a]/10 text-[#126b8a]' : 'bg-slate-100 text-slate-500'
        }`}>
          {flagged ? (
            <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
          ) : justSubmitted ? (
            <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
          ) : (
            <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
          )}
        </div>
        <h1 className="mb-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
          {justSubmitted
            ? flagged
              ? '填答已記錄'
              : '填答已送出！'
            : '您已填過此問卷'}
        </h1>
        {flagged && (
          <p className="mb-4 text-sm leading-6 text-amber-700">
            系統偵測到填答異常，請確保認真作答以維持您的信譽分數。
          </p>
        )}
        {justSubmitted && !flagged && survey.rewardPoints > 0 && (
          <p className="mb-6 text-slate-500">
            NT${survey.rewardPoints} 獎勵將在審核後發放至您的帳戶。
          </p>
        )}
        {justSubmitted && !flagged && survey.rewardMode === 'lottery' && (
          <p className="mb-6 text-slate-500">
            品質審核通過後，您會取得「{survey.lotteryPrize}」抽獎資格，開獎後會收到系統通知。
          </p>
        )}
        {/* 建立者自訂的感謝頁內容（結束設定） */}
        {justSubmitted && survey.thankYouMessage && (
          <p className="mx-auto mb-4 max-w-md whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
                className="w-full rounded-2xl border border-slate-100 object-contain"
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
              className="inline-flex items-center gap-2 rounded-full border border-[#126b8a]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#126b8a] transition hover:bg-[#126b8a]/5"
            >
              前往指定頁面
              <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
            </a>
          )}
          <button
            onClick={() => router.push('/tasks')}
            className="rounded-full bg-[#126b8a] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f5d78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126b8a]/30"
          >
            回到問卷列表
          </button>
          {justSubmitted && !flagged && (
            <button
              onClick={() => router.push('/spin')}
              className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.8} />
              前往轉盤
            </button>
          )}
        </div>
        </div>
      </SurveyShell>
    );
  }

  return (
    <SurveyShell
      className={fontFamilyClass(survey.theme?.fontFamily)}
      style={
        survey.theme?.backgroundColor && survey.theme.backgroundColor !== DEFAULT_BACKGROUND
          ? { backgroundColor: survey.theme.backgroundColor }
          : undefined
      }
    >
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126b8a]/30"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        返回
      </button>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#126b8a]">QuanWen survey</p>
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
            {survey.rewardPoints > 0 && (
              <MetaPill tone="accent">
                <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
                獎勵 NT${survey.rewardPoints}
              </MetaPill>
            )}
            {survey.rewardMode === 'lottery' && (
              <MetaPill tone="warm">
                <Gift className="h-3.5 w-3.5" strokeWidth={1.8} />
                抽獎：{survey.lotteryPrize}
              </MetaPill>
            )}
            {survey.isAnonymous && (
              <MetaPill>
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
                匿名填答
              </MetaPill>
            )}
            <MetaPill>
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
              {survey.questions.length} 題
            </MetaPill>
            {survey.questions.length > 0 && (
              <MetaPill>
                <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                預估約 {estimateFillMinutes(survey.questions.length)} 分鐘
              </MetaPill>
            )}
          </div>
        </div>
      </section>
      {survey.rewardMode === 'lottery' && (
        <div className="my-5 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs leading-6 text-amber-900 shadow-sm">
          <p className="font-semibold">抽獎規則：{lotteryDisclosure(survey)}</p>
          <p className="mt-1">平台追蹤：建立者已接受開獎後七日內交付獎品條款。平台會留存通知、中獎者確認與未收到回報，必要時介入處理並核驗履約紀錄。</p>
        </div>
      )}

      {/* Phase 2: 即時干預提示 */}
      {interventionMsg && (
        <div className="my-5 flex items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 shadow-sm">
          <div className="flex gap-2 text-sm leading-6 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{interventionMsg}</span>
          </div>
          <button
            onClick={() => setInterventionMsg(null)}
            className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
          >
            知道了
          </button>
        </div>
      )}

      {/* Submit error display */}
      {submitResponse.error && (() => {
        const err = submitResponse.error as { response?: { data?: { message?: string }; status?: number }; message?: string };
        const backendMsg = err?.response?.data?.message;
        const status = err?.response?.status;
        return (
          <p className="my-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {status === 409 ? '您已填寫過此問卷'
              : status === 401 ? '請重新登入'
              : status === 403 ? backendMsg ?? '權限不足'
              : status === 400 ? backendMsg ?? '送出資料有誤'
              : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
          </p>
        );
      })()}

      {/* SurveyJS Renderer */}
      <SurveyRendererSurveyJS
        survey={survey}
        onSubmit={handleSubmit}
        submitting={submitResponse.isPending}
      />
    </SurveyShell>
  );
}
