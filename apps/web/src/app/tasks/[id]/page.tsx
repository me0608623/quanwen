'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePublicSurvey, useSubmitResponse } from '@/hooks/use-responses';
import { BehaviorTracker, detectIntervention } from '@/lib/behavior-tracker';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import { DEFAULT_BACKGROUND, fontFamilyClass } from '@/components/survey-editor/survey-style-panel';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import type { AnswerInput } from '@/hooks/use-responses';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';

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

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">載入中…</div>;
  if (!survey)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="text-lg font-bold">問卷不存在或尚未上架</h1>
        <p className="mt-2 text-sm text-muted-foreground">這份問卷可能已截止或被下架。</p>
        <button
          onClick={() => router.push('/tasks')}
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          ← 回到問卷列表
        </button>
      </main>
    );

  // 外部問卷：站內無題目，顯示跳轉頁，引導填答者前往外部平台填寫
  if (survey.externalUrl) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold">{survey.title}</h1>
          {survey.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{survey.description}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm">
            {survey.estimatedMinutes ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 font-medium">
                ⏱️ 約 {survey.estimatedMinutes} 分鐘
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              🎁 {survey.rewardMode === 'lottery' ? `抽 ${survey.lotteryPrize ?? '獎品'}` : `NT$${survey.rewardPoints}`}
            </span>
          </div>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800">
            這份問卷在外部平台（例如 Google 表單）填寫。點擊下方按鈕會在新分頁開啟，請依問卷說明完成填答。
            <br />
            獎勵由問卷建立者依其填答結果發放。
          </div>
          <a
            href={survey.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            前往填寫問卷 ↗
          </a>
          <div className="mt-4">
            <button
              onClick={() => router.push('/tasks')}
              className="text-sm text-muted-foreground hover:underline"
            >
              ← 回到問卷列表
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (submitted || survey.alreadySubmitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-5xl mb-4">{flagged ? '⚠️' : survey.alreadySubmitted ? '📋' : '🎉'}</div>
        <h1 className="text-2xl font-bold mb-2">
          {survey.alreadySubmitted
            ? '您已填過此問卷'
            : flagged
            ? '填答已記錄'
            : '填答已送出！'}
        </h1>
        {flagged && (
          <p className="text-orange-600 text-sm mb-4">
            系統偵測到填答異常，請確保認真作答以維持您的信譽分數。
          </p>
        )}
        {!survey.alreadySubmitted && !flagged && survey.rewardPoints > 0 && (
          <p className="text-muted-foreground mb-6">
            NT${survey.rewardPoints} 獎勵將在審核後發放至您的帳戶。
          </p>
        )}
        {!survey.alreadySubmitted && !flagged && survey.rewardMode === 'lottery' && (
          <p className="text-muted-foreground mb-6">
            品質審核通過後，您會取得「{survey.lotteryPrize}」抽獎資格，開獎後會收到系統通知。
          </p>
        )}
        {/* 建立者自訂的感謝頁內容（結束設定） */}
        {!survey.alreadySubmitted && survey.thankYouMessage && (
          <p className="mx-auto mb-4 max-w-md whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {survey.thankYouMessage}
          </p>
        )}
        {!survey.alreadySubmitted && (survey.thankYouImages?.length ?? 0) > 0 && (
          <div className="mx-auto mb-6 max-w-md space-y-3">
            {survey.thankYouImages!.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={resolveAssetUrl(url)}
                alt={`感謝頁圖片 ${i + 1}`}
                className="w-full rounded-xl object-contain"
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!survey.alreadySubmitted && survey.thankYouRedirectUrl && (
            <a
              href={survey.thankYouRedirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[#126b8a] px-5 py-2 text-sm font-semibold text-[#126b8a] hover:bg-[#126b8a]/5"
            >
              前往指定頁面 ↗
            </a>
          )}
          <button
            onClick={() => router.push('/tasks')}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            回到問卷列表
          </button>
          {!survey.alreadySubmitted && !flagged && (
            <button
              onClick={() => router.push('/spin')}
              className="rounded-md border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              🎡 前往轉盤
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className={`mx-auto max-w-xl px-4 py-10 ${fontFamilyClass(survey.theme?.fontFamily)}`}
      style={
        survey.theme?.backgroundColor && survey.theme.backgroundColor !== DEFAULT_BACKGROUND
          ? { backgroundColor: survey.theme.backgroundColor }
          : undefined
      }
    >
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:underline mb-4 block"
      >
        ← 返回
      </button>
      {survey.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(survey.coverImageUrl)}
          alt=""
          className="mb-4 max-h-60 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="text-2xl font-bold mb-1">{survey.title}</h1>
      {survey.description && (
        <p className="text-sm text-muted-foreground mb-2">{survey.description}</p>
      )}
      {survey.welcomeImages && survey.welcomeImages.length > 0 && (
        <div className="mb-3 space-y-3">
          {survey.welcomeImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={resolveAssetUrl(url)}
              alt={`歡迎圖 ${i + 1}`}
              className="w-full rounded-xl object-contain"
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-8">
        {survey.rewardPoints > 0 && <span className="text-primary font-semibold">獎勵 NT${survey.rewardPoints}</span>}
        {survey.rewardMode === 'lottery' && (
          <span className="font-semibold text-amber-700">抽獎：{survey.lotteryPrize}</span>
        )}
        {survey.isAnonymous && <span>匿名填答</span>}
        <span>{survey.questions.length} 題</span>
        {survey.questions.length > 0 && (
          <span>· 預估約 {estimateFillMinutes(survey.questions.length)} 分鐘</span>
        )}
      </div>
      {survey.rewardMode === 'lottery' && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">抽獎規則：{lotteryDisclosure(survey)}</p>
          <p className="mt-1">平台追蹤：建立者已接受開獎後七日內交付獎品條款。平台會留存通知、中獎者確認與未收到回報，必要時介入處理並核驗履約紀錄。</p>
        </div>
      )}

      {/* Phase 2: 即時干預提示 */}
      {interventionMsg && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex gap-2 text-sm text-amber-800">
            <span>⚠️</span>
            <span>{interventionMsg}</span>
          </div>
          <button
            onClick={() => setInterventionMsg(null)}
            className="text-xs text-amber-700 hover:text-amber-900"
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
          <p className="text-sm text-destructive mb-4">
            {status === 409 ? '⚠️ 您已填寫過此問卷'
              : status === 401 ? '⚠️ 請重新登入'
              : status === 403 ? '⚠️ ' + (backendMsg ?? '權限不足')
              : status === 400 ? '⚠️ ' + (backendMsg ?? '送出資料有誤')
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
    </main>
  );
}
