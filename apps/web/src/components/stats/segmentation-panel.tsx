'use client';

import { useState } from 'react';
import { useSegmentation } from '@/hooks/use-analytics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const SEGMENT_COLORS = ['#126b8a', '#8B5CF6', '#10b981', '#f59e0b', '#ef4444'];

/**
 * 分群分析區段 — K-means 將回應者分群 + radar bar chart
 */
export function SegmentationSection({ surveyId }: { surveyId: string }) {
  const [k, setK] = useState(3);
  const [analyze, setAnalyze] = useState(false);

  const { data, isLoading, error } = useSegmentation(surveyId, k, analyze);

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        🧩 回應者分群分析（K-means）
      </h2>

      <div className="flex items-end gap-3 mb-4">
        <div className="w-24">
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">群數 (k)</label>
          <select
            value={k}
            onChange={(e) => { setK(Number(e.target.value)); setAnalyze(false); }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>
        <button
          onClick={() => setAnalyze(true)}
          className="rounded-md bg-[#126b8a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78]"
        >
          分群
        </button>
      </div>

      {analyze && isLoading && (
        <div className="space-y-2">
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: '60%' }} />
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: '40%' }} />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">分群失敗，請稍後再試</p>
      )}

      {data && !isLoading && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            共 {data.totalRespondents} 位回應者，分為 {data.segments.length} 群
          </p>

          {/* Segment cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.segments.map((seg, i) => (
              <div
                key={i}
                className="rounded-lg border border-border p-3 space-y-2"
                style={{ borderLeftColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length], borderLeftWidth: 3 }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{seg.label}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                  >
                    {seg.count} 人
                  </span>
                </div>
                <ul className="space-y-1">
                  {Object.values(seg.avgRatings).map((r, j) => (
                    <li key={j} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate mr-2">{r.questionTitle}</span>
                      <span className="font-semibold shrink-0">{r.avg.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Grouped bar chart comparing segments */}
          {data.segments.length > 0 && data.segments[0] && Object.keys(data.segments[0].avgRatings).length > 0 && (
            <SegmentBarChart segments={data.segments} />
          )}
        </div>
      )}
    </section>
  );
}

function SegmentBarChart({
  segments,
}: {
  segments: {
    label: string;
    count: number;
    avgRatings: Record<string, { questionTitle: string; avg: number }>;
  }[];
}) {
  // Build chart data: one entry per question, keys are segment labels
  const questionIds = Object.keys(segments[0]?.avgRatings ?? {});
  if (questionIds.length === 0) return null;

  const chartData = questionIds.map((qId) => {
    const entry: Record<string, string | number> = {
      question: segments[0].avgRatings[qId].questionTitle,
    };
    for (const seg of segments) {
      entry[seg.label] = seg.avgRatings[qId]?.avg ?? 0;
    }
    return entry;
  });

  const segLabels = segments.map((s) => s.label);

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        各群平均分比較
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, questionIds.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="question" tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : String(v)} />
          <Legend />
          {segLabels.map((label, i) => (
            <Bar
              key={label}
              dataKey={label}
              fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
              radius={[0, 4, 4, 0]}
              barSize={14}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
