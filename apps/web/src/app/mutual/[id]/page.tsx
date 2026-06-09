'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutualPair, useMutualPoolStats, useSubmitMutualResponse, useReEnqueueMutual, useSubmitMutualProof, useRateMutual, type MutualQuestion, type MutualUnlocked, type MutualPairDetail } from '@/hooks/use-mutual';
import { useMe } from '@/hooks/use-auth';
import { RatingScale, RatingScaleConfig } from '@/components/survey-editor/rating-scale';

type AnswerState = {
  textAnswer?: string;
  selectedOptionIds?: string[];
  ratingValue?: number;
};

export default function MutualFillPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pairId = params.id;

  const { data, isLoading, error, failureCount } = useMutualPair(pairId);
  const { data: me } = useMe();
  const submit = useSubmitMutualResponse();
  const reEnqueue = useReEnqueueMutual();

  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-4" aria-busy="true" aria-label="載入中">
        {failureCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            連線中斷，正在重試... ({failureCount}/3)
          </div>
        )}
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error ? (
            <>
              <p>連線失敗，3 次重試後仍無法載入。</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/5"
              >
                重新整理
              </button>
            </>
          ) : (
            <p>找不到此配對或無權存取。</p>
          )}
        </div>
        <Link href="/mutual" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← 回互惠列表
        </Link>
      </main>
    );
  }

  const { pair, survey, unlocked } = data;

  // 外部連結互惠 → 走截圖證明 + 互評流程（不是站內填答）
  if (survey?.externalUrl) {
    return <ExternalMutualView data={data} myUserId={me?.id} />;
  }

  if (pair.status === 'both_done') {
    return <UnlockedView unlocked={unlocked} />;
  }

  if (pair.status === 'waiting') {
    return <WaitingView pairId={pairId} createdAt={pair.createdAt} />;
  }

  if (pair.status === 'expired') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-4">
        <h1 className="text-2xl font-bold">⌛ 配對超時</h1>
        <p className="text-sm text-muted-foreground">
          這次配對超過 72 小時未完成，已自動失效。你的問卷沒有送出去，可以回列表重新發佈一份。
        </p>
        <div className="flex gap-3">
          <Link href="/mutual" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            ← 回互惠列表
          </Link>
          <Link href="/dashboard/surveys/new" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            重新發佈
          </Link>
        </div>
      </main>
    );
  }

  if (pair.status === 'cancelled') {
    // 我是 A 還是 B?  → 用 me.id 對比
    const iAmA = me?.id && me.id === pair.aUserId;
    const mySurveyId = iAmA ? pair.aSurveyId : (pair.bSurveyId ?? pair.aSurveyId);
    const handleReEnqueue = async () => {
      try {
        await reEnqueue.mutateAsync(mySurveyId);
        router.push('/mutual');
      } catch (err) {
        const e = err as { response?: { data?: { message?: string } } };
        alert(e?.response?.data?.message ?? '重新進池失敗');
      }
    };

    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-4">
        <h1 className="text-2xl font-bold">🚫 配對已取消</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold mb-1">原因：填答品質未通過 AI 審核</p>
          <p className="text-red-700">
            為了保護對方拿到品質好的填答，AI 品質審核分數過低會自動取消配對。對方的問卷已自動重新進入配對池。
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          你的問卷沒有送出去。可以把同一份問卷重新放回配對池等下一個對手，或回列表查看其他配對。
        </p>
        <div className="flex gap-3">
          <Link href="/mutual" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            ← 回互惠列表
          </Link>
          <button
            onClick={handleReEnqueue}
            disabled={reEnqueue.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {reEnqueue.isPending ? '重新進池中...' : '重新進池'}
          </button>
        </div>
      </main>
    );
  }

  if (!survey) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-muted-foreground">
        對方問卷尚未準備好，請稍後再試。
      </main>
    );
  }

  const updateAnswer = (qid: string, patch: AnswerState) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  };

  const onSubmit = async () => {
    const payload = survey.questions
      .map((q) => {
        const a = answers[q.id] ?? {};
        return {
          questionId: q.id,
          textAnswer: a.textAnswer,
          selectedOptionIds: a.selectedOptionIds,
          ratingValue: a.ratingValue,
        };
      })
      .filter((a) => a.textAnswer || (a.selectedOptionIds && a.selectedOptionIds.length > 0) || a.ratingValue);

    // Validate required
    const missing = survey.questions.filter((q) => {
      if (!q.isRequired) return false;
      const a = answers[q.id];
      if (!a) return true;
      if (q.type === 'text') return !a.textAnswer?.trim();
      if (q.type === 'single_choice' || q.type === 'multiple_choice') return !a.selectedOptionIds?.length;
      if (q.type === 'rating') return a.ratingValue === undefined;
      return false;
    });
    if (missing.length > 0) {
      alert(`還有 ${missing.length} 題必填未答`);
      return;
    }

    try {
      await submit.mutateAsync({ pairId, answers: payload });
      router.push('/mutual');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '提交失敗，請稍後再試');
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <Link href="/mutual" className="text-sm text-muted-foreground hover:underline">
          ← 回互惠列表
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{survey.title}</h1>
        {survey.description && (
          <p className="mt-1 text-sm text-muted-foreground">{survey.description}</p>
        )}
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          這是你的互惠對手發的問卷。你填完後，等對方也填完你的，雙方就同時解鎖看對方填答。
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="space-y-4"
      >
        {survey.questions.map((q, idx) => (
          <QuestionBlock
            key={q.id}
            index={idx + 1}
            q={q}
            value={answers[q.id] ?? {}}
            onChange={(patch) => updateAnswer(q.id, patch)}
          />
        ))}

        <div className="flex items-center justify-end gap-3 pt-2">
          {submit.error && (
            <p className="text-xs text-destructive">提交失敗</p>
          )}
          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submit.isPending ? '提交中…' : '提交填答'}
          </button>
        </div>
      </form>
    </main>
  );
}

function WaitingView({ pairId, createdAt }: { pairId: string; createdAt: string }) {
  const router = useRouter();
  const { data: pairData } = useMutualPair(pairId);
  const { data: poolStats } = useMutualPoolStats();

  const [elapsedSecs, setElapsedSecs] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000),
  );
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  useEffect(() => {
    if (pairData && pairData.pair.status !== 'waiting') {
      setRedirectIn(3);
    }
  }, [pairData]);

  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) {
      router.refresh();
      return;
    }
    const t = setTimeout(() => setRedirectIn((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [redirectIn, router]);

  const formatElapsed = (secs: number): string => {
    if (secs < 60) return `${secs} 秒`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} 分鐘`;
    return `${Math.floor(mins / 60)} 小時 ${mins % 60} 分鐘`;
  };

  if (redirectIn !== null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-4 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          🎉
        </div>
        <h1 className="text-2xl font-bold text-emerald-700">配對成功！</h1>
        <p className="text-sm text-muted-foreground">
          {redirectIn > 0 ? `${redirectIn} 秒後自動跳轉…` : '跳轉中…'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <Link href="/mutual" className="text-sm text-muted-foreground hover:underline">
          ← 回互惠列表
        </Link>
        <h1 className="mt-2 text-2xl font-bold">⏳ 配對中</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          系統正在幫你找另一個發了互惠問卷的人，每 30 秒掃描一次。
        </p>
      </div>

      {/* Progress bar — indeterminate animation */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="配對進度"
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="q-progress-bar h-full w-1/3 rounded-full bg-primary" />
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">已等待</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatElapsed(elapsedSecs)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs text-muted-foreground">目前配對池</p>
          </div>
          {poolStats !== undefined ? (
            <p className="mt-1 text-xl font-bold tabular-nums">
              {poolStats.waiting} 份等待配對
            </p>
          ) : (
            <div className="mt-1 h-7 w-24 animate-pulse rounded bg-muted" />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        每 15 秒自動更新 · 配對成功後自動跳轉
      </p>
    </main>
  );
}

function QuestionBlock({
  index,
  q,
  value,
  onChange,
}: {
  index: number;
  q: MutualQuestion;
  value: AnswerState;
  onChange: (v: AnswerState) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">
        {index}. {q.title}
        {q.isRequired && <span className="ml-1 text-destructive">*</span>}
      </div>
      {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}

      {q.type === 'text' && (
        <textarea
          value={value.textAnswer ?? ''}
          onChange={(e) => onChange({ textAnswer: e.target.value })}
          rows={3}
          maxLength={5000}
          placeholder="輸入你的回答…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      )}

      {q.type === 'single_choice' && (
        <div className="space-y-2">
          {q.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={value.selectedOptionIds?.[0] === opt.id}
                onChange={() => onChange({ selectedOptionIds: [opt.id] })}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {q.type === 'multiple_choice' && (
        <div className="space-y-2">
          {q.options.map((opt) => {
            const checked = value.selectedOptionIds?.includes(opt.id) ?? false;
            return (
              <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const prev = value.selectedOptionIds ?? [];
                    const next = e.target.checked ? [...prev, opt.id] : prev.filter((id) => id !== opt.id);
                    onChange({ selectedOptionIds: next });
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'rating' && (
        <RatingScale
          config={(q.config as RatingScaleConfig | null) ?? undefined}
          value={value.ratingValue ?? null}
          onSelect={(n) => onChange({ ratingValue: n })}
        />
      )}

      {q.type === 'matrix' && (
        <p className="text-xs italic text-muted-foreground">（矩陣題尚不支援，請略過或改用其他題型）</p>
      )}
    </div>
  );
}

function UnlockedView({ unlocked }: { unlocked: MutualUnlocked | null }) {
  if (!unlocked) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-4">
        <h1 className="text-2xl font-bold">✅ 已解鎖</h1>
        <p className="text-sm text-muted-foreground">資料載入中…</p>
        <Link href="/mutual" className="inline-block text-sm font-medium text-primary hover:underline">
          ← 回互惠列表
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <Link href="/mutual" className="text-sm text-muted-foreground hover:underline">
          ← 回互惠列表
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            ✅ 已解鎖
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold">{unlocked.mySurveyTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          以下是 <span className="font-semibold">{unlocked.otherDisplayName}</span> 填寫你這份問卷的答案。
        </p>
      </div>

      <div className="space-y-4">
        {unlocked.questions
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((q, idx) => (
            <div key={q.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold">
                {idx + 1}. {q.title}
              </p>
              <AnswerDisplay q={q} />
            </div>
          ))}
      </div>

      <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        💡 你的填答（你寫在對方問卷上的）也已送出，對方可以看見。
      </div>
    </main>
  );
}

function AnswerDisplay({ q }: { q: MutualUnlocked['questions'][number] }) {
  if (!q.answer) {
    return <p className="text-sm italic text-muted-foreground">（未作答）</p>;
  }

  if (q.type === 'text') {
    return (
      <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm">
        {q.answer.textAnswer || <span className="italic text-muted-foreground">（空白）</span>}
      </div>
    );
  }

  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const selected = new Set(q.answer.selectedOptionIds ?? []);
    return (
      <div className="space-y-1.5">
        {q.options.map((opt) => {
          const picked = selected.has(opt.id);
          return (
            <div
              key={opt.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                picked
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              <span className="text-xs">{picked ? '●' : '○'}</span>
              <span>{opt.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (q.type === 'rating') {
    return (
      <RatingScale
        config={(q.config as RatingScaleConfig | null | undefined) ?? undefined}
        value={q.answer?.ratingValue ?? null}
        disabled
      />
    );
  }

  return <p className="text-sm italic text-muted-foreground">（矩陣題顯示尚未支援）</p>;
}

// ─── 外部連結互惠視圖（截圖證明 + 互評）────────────────────────────────────────

function ExternalMutualView({ data, myUserId }: { data: MutualPairDetail; myUserId?: string }) {
  const { pair, survey } = data;
  const proof = useSubmitMutualProof();
  const rate = useRateMutual();
  const [proofUrl, setProofUrl] = useState('');
  const [rating, setRating] = useState(0);

  const iAmA = myUserId && myUserId === pair.aUserId;
  const myProof = iAmA ? pair.aProofUrl : pair.bProofUrl;
  const otherProof = iAmA ? pair.bProofUrl : pair.aProofUrl;
  const myRating = iAmA ? pair.aRating : pair.bRating;
  const isDone = pair.status === 'both_done';
  const isDead = pair.status === 'expired' || pair.status === 'cancelled';

  const handleProof = async () => {
    if (!proofUrl.trim()) return;
    try {
      await proof.mutateAsync({ pairId: pair.id, proofUrl: proofUrl.trim() });
      setProofUrl('');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '上傳失敗');
    }
  };

  const handleRate = async () => {
    if (rating < 1) return;
    try {
      await rate.mutateAsync({ pairId: pair.id, rating });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '評分失敗');
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <Link href="/mutual" className="text-sm text-muted-foreground hover:underline">← 回互惠列表</Link>
        <h1 className="mt-2 text-2xl font-bold">{survey?.title}</h1>
        <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
          🔗 外部連結互惠
        </span>
      </div>

      {isDead ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          此配對已{pair.status === 'expired' ? '超時' : '取消'}。
        </div>
      ) : (
        <>
          {/* Step 1: 去填對方的外部問卷 */}
          <section className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-sm font-semibold">① 去填對方的問卷</p>
            <a
              href={survey?.externalUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              開啟外部問卷 ↗
            </a>
            <p className="text-xs text-muted-foreground break-all">{survey?.externalUrl}</p>
          </section>

          {/* Step 2: 上傳截圖 */}
          <section className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-sm font-semibold">② 上傳你的完成截圖</p>
            {myProof ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-xs text-emerald-700">✓ 你已上傳截圖</p>
                <a href={myProof} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">{myProof}</a>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="貼上截圖圖片連結 https://..."
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={handleProof}
                  disabled={proof.isPending || !proofUrl.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {proof.isPending ? '上傳中…' : '上傳'}
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              對方：{otherProof ? '✓ 已上傳' : '尚未上傳'}
            </p>
          </section>

          {/* Step 3: 互評（both_done 才開放）*/}
          <section className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-semibold">③ 互評信譽</p>
            {!isDone ? (
              <p className="text-xs text-muted-foreground">雙方都上傳截圖後才能互評。</p>
            ) : myRating != null ? (
              <p className="text-sm text-emerald-700">✓ 你已給對方 {myRating} 星</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                        rating >= n ? 'border-amber-400 bg-amber-400 text-white' : 'border-border text-muted-foreground'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRate}
                  disabled={rate.isPending || rating < 1}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {rate.isPending ? '送出中…' : '送出評分'}
                </button>
                <p className="text-xs text-muted-foreground">
                  4-5 星 → 對方信譽 +2；1-2 星 → 對方信譽 -3。請誠實評分。
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
