'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGroupComparison, useInterpretStatistics } from '@/hooks/use-analytics';
import { PanelSkeletonContent } from '@/components/stats/panel-skeleton';

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
}

function isQuotaError(err: unknown): boolean {
  const resp = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  return resp?.status === 403 && resp?.data?.message === 'AI feature limit reached';
}

/**
 * 差異性分析區段 — 以單選題分組，比較評分題平均（t 檢定 / 單因子 ANOVA）。
 * 統計由後端精確計算；「AI 解讀」會耗用 AI 分析額度。
 */
export function GroupComparisonSection({
  questionStats,
  surveyId,
}: {
  questionStats: QuestionStat[];
  surveyId: string;
}) {
  const ratingQuestions = questionStats.filter((q) => q.type === 'rating');
  const groupQuestions = questionStats.filter((q) => q.type === 'single_choice');

  const [ratingId, setRatingId] = useState(ratingQuestions[0]?.questionId ?? '');
  const [groupId, setGroupId] = useState(groupQuestions[0]?.questionId ?? '');
  const [analyze, setAnalyze] = useState(false);

  const { data, isLoading, error } = useGroupComparison(surveyId, ratingId, groupId, analyze);
  const interpret = useInterpretStatistics();

  if (ratingQuestions.length < 1 || groupQuestions.length < 1) return null;

  const runInterpret = () =>
    interpret.mutate({ surveyId, analysisType: 'group_comparison', ratingQuestionId: ratingId, groupQuestionId: groupId });

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        🧪 差異性分析（t 檢定 / 單因子變異數分析）
      </h2>
      <p className="mb-4 text-xs text-slate-500">選一個分組（單選題）與一個評分題，檢定不同組別的平均分是否有顯著差異。</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">評分題（依變數）</label>
          <select
            value={ratingId}
            onChange={(e) => { setRatingId(e.target.value); setAnalyze(false); interpret.reset(); }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {ratingQuestions.map((q) => (
              <option key={q.questionId} value={q.questionId}>{q.title}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">分組題（單選）</label>
          <select
            value={groupId}
            onChange={(e) => { setGroupId(e.target.value); setAnalyze(false); interpret.reset(); }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {groupQuestions.map((q) => (
              <option key={q.questionId} value={q.questionId}>{q.title}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setAnalyze(true); interpret.reset(); }}
          className="rounded-md bg-[#126b8a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78]"
        >
          分析
        </button>
      </div>

      {analyze && isLoading && <PanelSkeletonContent rows={3} />}
      {error && <p className="text-xs text-red-600">分析失敗，請稍後再試</p>}

      {data && !isLoading && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">組別</th>
                  <th className="pb-2 text-right font-medium">n</th>
                  <th className="pb-2 text-right font-medium">平均</th>
                  <th className="pb-2 text-right font-medium">標準差</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={g.optionId} className="border-b border-border/50 last:border-0">
                    <td className="py-2">{g.label}</td>
                    <td className="py-2 text-right">{g.n}</td>
                    <td className="py-2 text-right font-semibold">{g.mean ?? '—'}</td>
                    <td className="py-2 text-right text-muted-foreground">{g.stddev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.test && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
              <span>
                {data.test.type === 't' ? 't' : 'F'} ={' '}
                <strong>{data.test.statistic}</strong>
              </span>
              <span className="text-muted-foreground">
                自由度 {data.test.df1}{data.test.df2 !== null ? ` / ${data.test.df2}` : ''}
              </span>
              <span className={data.test.p < 0.05 ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>
                p = {data.test.p}{data.test.p < 0.05 ? '（顯著）' : '（未達顯著）'}
              </span>
              {data.test.effectSize !== null && (
                <span className="text-muted-foreground">{data.test.effectSizeLabel} = {data.test.effectSize}</span>
              )}
            </div>
          )}

          <p className="text-sm text-slate-700">{data.interpretation}</p>

          {data.test && (
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

export function AiInterpretBlock({
  interpret,
}: {
  interpret: ReturnType<typeof useInterpretStatistics>;
}) {
  if (interpret.isError) {
    return (
      <p className="mt-3 text-xs text-red-600">
        {isQuotaError(interpret.error) ? (
          <>今日 AI 分析次數已用完，明天會自動重置，或 <Link href="/dashboard/shop" className="font-semibold underline">升級方案</Link> 取得更多次數。</>
        ) : (
          'AI 解讀失敗，請稍後再試。'
        )}
      </p>
    );
  }
  if (!interpret.data) return null;
  return (
    <div className="mt-3 rounded-lg border border-[#126b8a]/30 bg-gradient-to-br from-[#126b8a]/[0.04] to-[#8B5CF6]/[0.03] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#126b8a]">✨ AI 解讀</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{interpret.data.interpretation}</p>
      {interpret.data.caveats.length > 0 && (
        <ul className="mt-3 space-y-1">
          {interpret.data.caveats.map((c, i) => (
            <li key={i} className="border-l-2 border-amber-300 bg-amber-50/50 py-1 pl-3 pr-2 text-xs text-slate-600">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
