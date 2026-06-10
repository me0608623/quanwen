'use client';

import { useState } from 'react';
import { useRegression, useInterpretStatistics } from '@/hooks/use-analytics';
import { AiInterpretBlock } from './group-comparison-panel';
import { PanelSkeletonContent } from '@/components/stats/panel-skeleton';

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
}

/**
 * 複迴歸區段 — 以多個評分題（自變數）預測一個評分題（應變數）。
 * 統計由後端精確計算；「AI 解讀」會耗用 AI 分析額度。
 */
export function RegressionSection({
  questionStats,
  surveyId,
}: {
  questionStats: QuestionStat[];
  surveyId: string;
}) {
  const ratingQuestions = questionStats.filter((q) => q.type === 'rating');

  const [dependentId, setDependentId] = useState(ratingQuestions[0]?.questionId ?? '');
  const [independentIds, setIndependentIds] = useState<string[]>([]);
  const [analyze, setAnalyze] = useState(false);

  const independents = independentIds.filter((id) => id !== dependentId);
  const { data, isLoading, error } = useRegression(surveyId, dependentId, independents, analyze);
  const interpret = useInterpretStatistics();

  if (ratingQuestions.length < 2) return null;

  const toggleIndependent = (id: string) => {
    setAnalyze(false);
    interpret.reset();
    setIndependentIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const runInterpret = () =>
    interpret.mutate({ surveyId, analysisType: 'regression', dependentId, independentIds: independents });

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        📉 迴歸分析（多元線性迴歸）
      </h2>
      <p className="mb-4 text-xs text-slate-500">選一個要預測的評分題（應變數），再勾選用來預測它的其他評分題（自變數）。</p>

      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">應變數（要預測的題目）</label>
        <select
          value={dependentId}
          onChange={(e) => { setDependentId(e.target.value); setAnalyze(false); interpret.reset(); }}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm sm:max-w-md"
        >
          {ratingQuestions.map((q) => (
            <option key={q.questionId} value={q.questionId}>{q.title}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">自變數（預測變數，可多選）</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {ratingQuestions.filter((q) => q.questionId !== dependentId).map((q) => (
            <label key={q.questionId} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={independentIds.includes(q.questionId)}
                onChange={() => toggleIndependent(q.questionId)}
              />
              <span className="truncate">{q.title}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={() => { setAnalyze(true); interpret.reset(); }}
        disabled={independents.length === 0}
        className="rounded-md bg-[#126b8a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78] disabled:cursor-not-allowed disabled:opacity-40"
      >
        執行迴歸
      </button>
      {independents.length === 0 && <p className="mt-2 text-xs text-amber-600">請至少勾選 1 個自變數</p>}

      {analyze && isLoading && (
        <div className="mt-4">
          <PanelSkeletonContent rows={3} />
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-600">分析失敗，請稍後再試</p>}

      {data && !isLoading && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
            <span>R² = <strong>{data.rSquared ?? '—'}</strong></span>
            <span className="text-muted-foreground">調整後 R² = {data.adjustedRSquared ?? '—'}</span>
            <span className="text-muted-foreground">n = {data.n}</span>
          </div>

          {data.intercept !== null && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">預測變數</th>
                    <th className="pb-2 text-right font-medium">係數 B</th>
                    <th className="pb-2 text-right font-medium">標準化 β</th>
                    <th className="pb-2 text-right font-medium">t</th>
                    <th className="pb-2 text-right font-medium">p</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <td className="py-2">截距</td>
                    <td className="py-2 text-right">{data.intercept}</td>
                    <td className="py-2 text-right">—</td>
                    <td className="py-2 text-right">—</td>
                    <td className="py-2 text-right">—</td>
                  </tr>
                  {data.predictors.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2">{p.title}</td>
                      <td className="py-2 text-right font-semibold">{p.coefficient ?? '—'}</td>
                      <td className="py-2 text-right">{p.standardizedBeta ?? '—'}</td>
                      <td className="py-2 text-right text-muted-foreground">{p.tStat ?? '—'}</td>
                      <td className={`py-2 text-right ${p.p !== null && p.p < 0.05 ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>
                        {p.p ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-sm text-slate-700">{data.interpretation}</p>

          {data.intercept !== null && (
            <div className="border-t border-border/60 pt-3">
              <button
                onClick={runInterpret}
                disabled={interpret.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1.5 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10 disabled:opacity-50"
              >
                ✨ {interpret.isPending ? 'AI 解讀中…' : 'AI 白話解讀'}
              </button>
              <AiInterpretBlock interpret={interpret} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
