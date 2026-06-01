'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePublicSurvey, useSubmitResponse } from '@/hooks/use-responses';
import { BehaviorTracker, detectIntervention } from '@/lib/behavior-tracker';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import type { AnswerInput } from '@/hooks/use-responses';

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
  if (!survey) return <div className="p-10 text-sm text-destructive">問卷不存在或尚未上架</div>;

  if (submitted || survey.alreadySubmitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-5xl mb-4">{flagged ? '⚠️' : survey.alreadySubmitted ? '📋' : '🎉'}</div>
        <h1 className="text-2xl font-bold mb-2">
          {survey.alreadySubmitted
            ? '您已填過此問卷'
            : flagged
            ? '填答已記錄'
            : '感謝您的填答！'}
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
        <button
          onClick={() => router.push('/tasks')}
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          回到問卷列表
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:underline mb-4 block"
      >
        ← 返回
      </button>
      <h1 className="text-2xl font-bold mb-1">{survey.title}</h1>
      {survey.description && (
        <p className="text-sm text-muted-foreground mb-2">{survey.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-8">
        {survey.rewardPoints > 0 && <span className="text-primary font-semibold">獎勵 NT${survey.rewardPoints}</span>}
        {survey.isAnonymous && <span>匿名填答</span>}
        <span>{survey.questions.length} 題</span>
      </div>

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
