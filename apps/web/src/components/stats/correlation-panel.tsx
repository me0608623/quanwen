'use client';

import { useState } from 'react';
import { useCorrelation } from '@/hooks/use-analytics';
import { PanelSkeletonContent } from '@/components/stats/panel-skeleton';
import { EmptyCapabilityCard } from '@/components/stats/empty-capability-card';

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
}

/**
 * 相關性分析區段 — 選兩個評分題，顯示 Pearson r + 解讀
 */
export function CorrelationSection({
  questionStats,
  surveyId,
}: {
  questionStats: QuestionStat[];
  surveyId: string;
}) {
  const ratingQuestions = questionStats.filter((q) => q.type === 'rating');

  const [qA, setQA] = useState(ratingQuestions[0]?.questionId ?? '');
  const [qB, setQB] = useState(ratingQuestions[1]?.questionId ?? '');
  const [analyze, setAnalyze] = useState(false);

  const { data, isLoading, error } = useCorrelation(
    surveyId,
    qA,
    qB,
    analyze && qA !== qB,
  );

  if (ratingQuestions.length < 2) {
    return (
      <EmptyCapabilityCard
        title="相關性分析（Pearson）"
        description="需要至少 2 題評分題，才能計算題目間的相關係數。"
      />
    );
  }

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        📈 相關性分析（Pearson）
      </h2>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">題目 A</label>
          <select
            value={qA}
            onChange={(e) => { setQA(e.target.value); setAnalyze(false); }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {ratingQuestions.map((q) => (
              <option key={q.questionId} value={q.questionId}>{q.title}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">題目 B</label>
          <select
            value={qB}
            onChange={(e) => { setQB(e.target.value); setAnalyze(false); }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {ratingQuestions.map((q) => (
              <option key={q.questionId} value={q.questionId}>{q.title}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setAnalyze(true)}
          disabled={qA === qB}
          className="rounded-md bg-[#126b8a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          分析
        </button>
      </div>

      {qA === qB && (
        <p className="text-xs text-amber-600">請選擇兩個不同的題目</p>
      )}

      {analyze && qA !== qB && isLoading && <PanelSkeletonContent rows={3} />}

      {error && (
        <p className="text-xs text-red-600">分析失敗，請稍後再試</p>
      )}

      {data && !isLoading && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-[#126b8a]">
              {data.pearsonR !== null ? data.pearsonR.toFixed(3) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">Pearson r</span>
          </div>

          {/* Correlation strength bar */}
          {data.pearsonR !== null && (
            <div>
              <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="absolute top-0 h-full rounded-full transition-all"
                  style={{
                    left: '50%',
                    width: `${Math.abs(data.pearsonR) * 50}%`,
                    marginLeft: data.pearsonR < 0 ? `${-Math.abs(data.pearsonR) * 50}%` : 0,
                    backgroundColor:
                      Math.abs(data.pearsonR) >= 0.7 ? '#10b981' :
                      Math.abs(data.pearsonR) >= 0.4 ? '#f59e0b' : '#94a3b8',
                  }}
                />
                <div className="absolute top-0 left-1/2 w-px h-full bg-slate-400" />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>-1</span><span>0</span><span>+1</span>
              </div>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{data.questionA.title}</span> 與{' '}
              <span className="font-medium text-foreground">{data.questionB.title}</span>
            </p>
            <p className="mt-1">
              相關係數 <strong>{data.pearsonR ?? '—'}</strong>，{data.interpretation}（n={data.n}）
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
