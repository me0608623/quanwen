'use client';

import { useState, useMemo } from 'react';
import { useCrossTab } from '@/hooks/use-analytics';
import type { CrossTabResult } from '@/hooks/use-analytics';
import { PanelSkeletonContent } from '@/components/stats/panel-skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const PALETTE = ['#126b8a', '#0F2A5C', '#8B5CF6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

/**
 * Cross-tab matrix visualization — grouped bar chart + Cramér's V
 */
export function CrossTabPanel({ data }: { data: CrossTabResult }) {
  // Transform matrix into recharts-friendly grouped bar data
  const chartData = useMemo(() => {
    return data.rows.map((rowLabel, i) => {
      const entry: Record<string, string | number> = { rowLabel };
      data.cols.forEach((colLabel, j) => {
        entry[colLabel] = data.matrix[i][j];
      });
      return entry;
    });
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          {data.questionA.title} × {data.questionB.title}
        </p>
        {data.cramersV !== null && (
          <span className="rounded-full bg-[#126b8a]/10 px-2.5 py-0.5 text-xs font-semibold text-[#126b8a]">
            Cramér&apos;s V = {data.cramersV}
          </span>
        )}
      </div>

      {chartData.length > 0 && data.cols.length > 0 && (
        <div style={{ width: '100%', height: Math.max(200, chartData.length * 40) }}>
          <ResponsiveContainer height={Math.max(200, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="rowLabel"
                width={120}
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.cols.map((col, idx) => (
                <Bar
                  key={col}
                  dataKey={col}
                  fill={PALETTE[idx % PALETTE.length]}
                  radius={[0, 4, 4, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Raw matrix table for accessibility */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:underline">查看原始交叉表</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-slate-200 px-2 py-1 bg-slate-50" />
                {data.cols.map((c) => (
                  <th key={c} className="border border-slate-200 px-2 py-1 bg-slate-50 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={row}>
                  <td className="border border-slate-200 px-2 py-1 font-medium bg-slate-50">{row}</td>
                  {data.cols.map((_, j) => (
                    <td key={j} className="border border-slate-200 px-2 py-1 text-center">
                      {data.matrix[i][j]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ─── Section wrapper for stats page ─────────────────────────────────────────

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
  totalAnswers: number;
}

export function CrossTabSection({ questionStats, surveyId }: { questionStats: QuestionStat[]; surveyId: string }) {
  const singleChoiceQuestions = useMemo(
    () => questionStats.filter((q) => q.type === 'single_choice'),
    [questionStats],
  );

  const [qA, setQA] = useState('');
  const [qB, setQB] = useState('');

  const { data, isLoading, error } = useCrossTab(surveyId, qA, qB, !!qA && !!qB);

  if (singleChoiceQuestions.length < 2) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border p-5 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        交叉分析
      </h2>
      <p className="text-xs text-muted-foreground">
        選擇兩個單選題，查看它們之間的關聯
      </p>

      <div className="flex flex-wrap gap-3">
        <select
          value={qA}
          onChange={(e) => {
            const next = e.target.value;
            setQA(next);
            if (next === qB) setQB('');
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">— 選擇題目 A —</option>
          {singleChoiceQuestions.map((q) => (
            <option key={q.questionId} value={q.questionId}>
              {q.title}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-muted-foreground">×</span>
        <select
          value={qB}
          onChange={(e) => setQB(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">— 選擇題目 B —</option>
          {singleChoiceQuestions
            .filter((q) => q.questionId !== qA)
            .map((q) => (
              <option key={q.questionId} value={q.questionId}>
                {q.title}
              </option>
            ))}
        </select>
      </div>

      {(!qA || !qB) && (
        <p className="text-xs text-muted-foreground italic">請選擇兩個題目</p>
      )}

      {isLoading && <PanelSkeletonContent rows={3} />}
      {error && <p className="text-xs text-red-600">交叉分析失敗，請稍後再試</p>}
      {data && !isLoading && <CrossTabPanel data={data} />}
    </section>
  );
}
