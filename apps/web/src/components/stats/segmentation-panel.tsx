'use client';

import { useState } from 'react';
import { useSegmentation } from '@/hooks/use-analytics';
import { PanelSkeletonContent } from '@/components/stats/panel-skeleton';
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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        🧩 回應者分群分析（K-means）
      </h2>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        自動把作答模式相似的填答者分成幾個族群，幫你看出「不同類型的受眾各是什麼樣子」——
        例如哪一群偏好什麼選項、哪一群評分普遍偏低。選擇群數（k）後按「分群」即可；
        群數建議從 3 開始嘗試，分得太細每群人數會太少。分群依據為評分題分數與選擇題作答組合。
      </p>

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

      {analyze && isLoading && <PanelSkeletonContent rows={3} />}

      {error && (
        <p className="text-xs text-red-600">分群失敗，請稍後再試</p>
      )}

      {data && !isLoading && data.segments.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          目前無法分群：此問卷沒有可分群的題型（評分題／單選題／多選題），或還沒有任何已提交的填答。
        </div>
      )}

      {data && !isLoading && data.segments.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            共 {data.totalRespondents} 位回應者，分為 {data.segments.length} 群
          </p>
          {data.normalizedToCommonScale && (
            <p className="text-[11px] text-muted-foreground">
              分群距離會先將不同量尺標準化至共同 0-1 尺度；卡片保留原始平均分，圖表改用相對百分比比較。
            </p>
          )}

          {/* Segment cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.segments.map((seg, i) => (
              <div
                key={seg.segmentId}
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
                      <span className="font-semibold shrink-0">
                        {r.avg === null ? '—' : r.avg.toFixed(2)}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({r.scaleMin}-{r.scaleMax}，n={r.answeredCount})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {seg.choiceProfiles && Object.keys(seg.choiceProfiles).length > 0 && (
                  <ul className="space-y-1.5 border-t border-border pt-2">
                    {Object.values(seg.choiceProfiles).map((p, j) => (
                      <li key={j} className="text-xs">
                        <p className="text-muted-foreground truncate">{p.questionTitle}</p>
                        <p className="mt-0.5 flex flex-wrap gap-1">
                          {p.topOptions.map((o, m) => (
                            <span key={m} className="rounded bg-muted px-1.5 py-0.5 font-medium">
                              {o.label} {Math.round(o.pct * 100)}%
                            </span>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
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
    segmentId: string;
    label: string;
    count: number;
    avgRatings: Record<string, {
      questionTitle: string;
      avg: number | null;
      scaleMin: number;
      scaleMax: number;
      relativeAvg: number | null;
      answeredCount: number;
    }>;
  }[];
}) {
  // Build chart data: one entry per question, keys are segment labels
  const questionIds = Object.keys(segments[0]?.avgRatings ?? {});
  if (questionIds.length === 0) return null;

  const chartData = questionIds.map((qId) => {
    const entry: Record<string, string | number | null> = {
      question: segments[0].avgRatings[qId].questionTitle,
    };
    for (const seg of segments) {
      const relativeAvg = seg.avgRatings[qId]?.relativeAvg;
      entry[seg.segmentId] = relativeAvg === null || relativeAvg === undefined ? null : relativeAvg * 100;
    }
    return entry;
  });

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        各群相對平均分比較
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, questionIds.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <YAxis type="category" dataKey="question" tick={{ fontSize: 11 }} width={80} />
          <Tooltip formatter={(v: any) => typeof v === 'number' ? `${v.toFixed(1)}%` : String(v)} />
          <Legend />
          {segments.map((segment, i) => (
            <Bar
              key={segment.segmentId}
              dataKey={segment.segmentId}
              name={segment.label}
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
