'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePublicSurvey, useSubmitResponse, AnswerInput, PublicQuestion } from '@/hooks/use-responses';
import { BehaviorTracker, detectIntervention } from '@/lib/behavior-tracker';

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

  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [submitted, setSubmitted] = useState(false);
  const [flagged, setFlagged] = useState(false);

  const setAnswer = (questionId: string, partial: Partial<AnswerInput>) => {
    // 進入該題（紀錄 per-question time）
    trackerRef.current?.enterQuestion(questionId);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...partial, questionId },
    }));
  };

  const validate = () => {
    if (!survey) return false;
    for (const q of survey.questions) {
      if (!q.isRequired) continue;
      const ans = answers[q.id];
      if (!ans) return false;
      if (q.type === 'text' && !ans.textAnswer?.trim()) return false;
      if ((q.type === 'single_choice' || q.type === 'multiple_choice') && !ans.selectedOptionIds?.length) return false;
      if (q.type === 'rating' && ans.ratingValue == null) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    // dump tracker 為一個快照（含 perQuestionTimeMs、windowSwitch、paste 等）
    const behaviorLog = trackerRef.current?.dump();
    try {
      const result = await submitResponse.mutateAsync({
        answers: Object.values(answers),
        startedAt: startedAtRef.current,
        behaviorLog,
      });
      setFlagged(result.flagged);
      setSubmitted(true);
    } catch (err: unknown) {
      // 不要把錯誤拋上去（會被 Next.js 顯示為 Unhandled Runtime Error）；
      // submitResponse.error 已經會 render 錯誤訊息
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        // 已經填過 → 視同已完成（後端會擋重複，前端表現一致）
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

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {survey.questions.map((q, i) => (
          <QuestionInput
            key={q.id}
            question={q}
            index={i}
            answer={answers[q.id]}
            onChange={(partial) => setAnswer(q.id, partial)}
          />
        ))}

        {submitResponse.error && (() => {
          const err = submitResponse.error as { response?: { data?: { message?: string }; status?: number }; message?: string };
          const backendMsg = err?.response?.data?.message;
          const status = err?.response?.status;
          return (
            <p className="text-sm text-destructive">
              {status === 409 ? '⚠️ 您已填寫過此問卷'
                : status === 401 ? '⚠️ 請重新登入'
                : status === 403 ? '⚠️ ' + (backendMsg ?? '權限不足')
                : status === 400 ? '⚠️ ' + (backendMsg ?? '送出資料有誤')
                : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
            </p>
          );
        })()}

        <button
          type="submit"
          disabled={submitResponse.isPending || !validate()}
          className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitResponse.isPending ? '提交中…' : '送出填答'}
        </button>
      </form>
    </main>
  );
}

// ─── 單題輸入元件 ─────────────────────────────────────────────────────────────

function QuestionInput({
  question,
  index,
  answer,
  onChange,
}: {
  question: PublicQuestion;
  index: number;
  answer?: AnswerInput;
  onChange: (partial: Partial<AnswerInput>) => void;
}) {
  const maxRating = (question.config?.maxRating as number) ?? 5;

  return (
    <div className="space-y-3">
      <p className="font-medium">
        <span className="text-muted-foreground text-sm mr-2">Q{index + 1}.</span>
        {question.title}
        {question.isRequired && <span className="text-destructive ml-1">*</span>}
      </p>
      {question.description && (
        <p className="text-xs text-muted-foreground">{question.description}</p>
      )}

      {/* Single choice */}
      {question.type === 'single_choice' && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value={opt.id}
                checked={answer?.selectedOptionIds?.[0] === opt.id}
                onChange={() => onChange({ selectedOptionIds: [opt.id] })}
                className="h-4 w-4 text-primary"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Multiple choice */}
      {question.type === 'multiple_choice' && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const checked = answer?.selectedOptionIds?.includes(opt.id) ?? false;
            return (
              <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = answer?.selectedOptionIds ?? [];
                    const next = e.target.checked
                      ? [...current, opt.id]
                      : current.filter((id) => id !== opt.id);
                    onChange({ selectedOptionIds: next });
                  }}
                  className="h-4 w-4 rounded text-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Text */}
      {question.type === 'text' && (
        <textarea
          value={answer?.textAnswer ?? ''}
          onChange={(e) => onChange({ textAnswer: e.target.value })}
          rows={4}
          placeholder="請輸入您的回答…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}

      {/* Rating */}
      {question.type === 'rating' && (
        <div className="flex gap-2">
          {Array.from({ length: maxRating }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ratingValue: v })}
              className={[
                'h-10 w-10 rounded-full border text-sm font-medium transition-colors',
                answer?.ratingValue === v
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-primary/60',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
          {answer?.ratingValue && (
            <span className="self-center text-xs text-muted-foreground ml-1">
              {answer.ratingValue} / {maxRating}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
