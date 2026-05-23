'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getToken } from '@/lib/token';
import { useSurveyTrend, useSurveyAiInsights, useQuestionSentiment } from '@/hooks/use-surveys';
import { OptionBarChart, QualityDonut } from '@/components/stats/charts';

interface OptionCount { optionId: string; label: string; count: number }
interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
  totalAnswers: number;
  optionCounts?: OptionCount[];
  averageRating?: number | null;
  sampleTexts?: (string | null)[];
}
interface QualityDistribution {
  total: number;
  passed: number;
  suspicious: number;
  rejected: number;
  unaudited: number;
  avgScore: number | null;
}
interface SurveyStats {
  surveyId: string;
  title: string;
  totalResponses: number;
  questionStats: QuestionStat[];
  qualityDistribution?: QualityDistribution;
}

function useSurveyStats(id: string) {
  return useQuery<SurveyStats>({
    queryKey: ['surveys', id, 'stats'],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${id}/stats`);
      return data;
    },
    enabled: !!id,
  });
}

// ─── 趨勢圖（純 CSS bar chart）──────────────────────────────────────────────

function TrendChart({ surveyId }: { surveyId: string }) {
  const { data: trend = [] } = useSurveyTrend(surveyId);
  const max = Math.max(...trend.map((t) => t.count), 1);

  // 只顯示後 14 天（太多看不清）
  const visible = trend.slice(-14);

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        近 14 天填答趨勢
      </h2>
      <div className="flex items-end gap-1 h-24">
        {visible.map((pt) => {
          const pct = Math.round((pt.count / max) * 100);
          return (
            <div key={pt.date} className="flex-1 flex flex-col items-center gap-0.5 group">
              <div
                className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-all"
                style={{ height: `${Math.max(pct, pt.count > 0 ? 4 : 0)}%` }}
                title={`${pt.date}: ${pt.count} 份`}
              />
              {pt.count > 0 && (
                <span className="text-[9px] text-muted-foreground tabular-nums">{pt.count}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
        <span>{visible[0]?.date.slice(5)}</span>
        <span>{visible[visible.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
  );
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

export default function SurveyStatsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: stats, isLoading } = useSurveyStats(id);

  const downloadBinary = (path: string, filename: string) => {
    const token = getToken() ?? '';
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}${path}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`Export 失敗：${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('download', filename);
        a.href = blobUrl;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch((err: Error) => alert(err.message));
  };

  const handleExportCsv = (cleanOnly = false) =>
    downloadBinary(
      `/surveys/${id}/export${cleanOnly ? '?clean=1' : ''}`,
      cleanOnly ? `survey_${id}_responses_clean.csv` : `survey_${id}_responses.csv`,
    );

  const handleExportPdf = () =>
    downloadBinary(`/surveys/${id}/export.pdf`, `survey_${id}_report.pdf`);

  const handleExportXlsx = (cleanOnly = false) =>
    downloadBinary(
      `/surveys/${id}/export.xlsx${cleanOnly ? '?clean=1' : ''}`,
      cleanOnly ? `survey_${id}_responses_clean.xlsx` : `survey_${id}_responses.xlsx`,
    );

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">載入中…</div>;
  if (!stats) return <div className="p-10 text-sm text-destructive">無法取得統計資料</div>;

  const completionPct = stats.totalResponses > 0 ? Math.min(100, stats.totalResponses) : 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:underline">
            ← 返回問卷
          </button>
          <h1 className="mt-2 text-2xl font-bold">{stats.title}</h1>
          <p className="text-sm text-muted-foreground">共 {stats.totalResponses} 份有效填答</p>
        </div>
        <div className="shrink-0 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => handleExportCsv(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            CSV
          </button>
          <button
            onClick={() => handleExportXlsx(false)}
            className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs hover:bg-emerald-100"
            title="Excel: Responses + Summary 兩個 sheet"
          >
            📊 Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-1.5 text-xs hover:bg-rose-100"
            title="PDF 統計總覽報表"
          >
            📄 PDF 報表
          </button>
          <button
            onClick={() => handleExportXlsx(true)}
            className="rounded-md border border-[#126b8a] bg-[#126b8a] px-3 py-1.5 text-xs text-white font-semibold hover:bg-[#0f5d78]"
            title="只匯出 quality score ≥ 70 的高品質樣本（Excel）"
          >
            ✨ 乾淨 Excel
          </button>
        </div>
      </div>

      {/* Quality Distribution（品質審核分布）*/}
      {stats.qualityDistribution && stats.qualityDistribution.total > 0 && (
        <QualityDistributionPanel data={stats.qualityDistribution} />
      )}

      {/* AI 洞察 */}
      <AiInsightsPanel surveyId={id} totalResponses={stats.totalResponses} />

      {/* 趨勢圖 */}
      <TrendChart surveyId={id} />

      {/* 題目統計 */}
      {stats.questionStats.map((q, i) => (
        <section key={q.questionId} className="rounded-lg border border-border p-5 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Q{i + 1} · {q.type}</p>
            <p className="font-medium mt-0.5">{q.title}</p>
            <p className="text-xs text-muted-foreground">{q.totalAnswers} 人回答</p>
          </div>

          {/* 單選 / 多選 — Phase V: recharts BarChart */}
          {q.optionCounts && q.optionCounts.length > 0 && (
            <OptionBarChart data={q.optionCounts} totalAnswers={q.totalAnswers} />
          )}

          {/* 評分 */}
          {q.averageRating !== undefined && (
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">
                {q.averageRating != null ? q.averageRating.toFixed(1) : '—'}
              </p>
              <span className="text-sm text-muted-foreground">平均分（滿 5 分）</span>
            </div>
          )}

          {/* 文字回答 */}
          {q.type === 'text' && q.sampleTexts && q.sampleTexts.length > 0 && (
            <>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {q.sampleTexts.map((t, j) => (
                  <li key={j} className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
                    {t}
                  </li>
                ))}
              </ul>
              <SentimentPanel surveyId={id} questionId={q.questionId} />
            </>
          )}
        </section>
      ))}
    </main>
  );
}

// ─── Sentiment Panel ─────────────────────────────────────────────────────────

function SentimentPanel({ surveyId, questionId }: { surveyId: string; questionId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, error } = useQuestionSentiment(surveyId, questionId, enabled);

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        className="mt-3 inline-flex items-center gap-1 rounded-md border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1.5 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
      >
        ✨ AI 情緒分類
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#126b8a]/30 bg-gradient-to-br from-[#126b8a]/[0.04] to-[#8B5CF6]/[0.03] p-4">
      {(isLoading || isFetching) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
            ✨ 情緒分析中…
          </p>
          <div className="h-2 animate-pulse rounded bg-slate-200" />
        </div>
      )}
      {error && <p className="text-xs text-red-600">AI 服務暫時無法使用</p>}
      {data && !isLoading && !isFetching && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
              ✨ 情緒分析（{data.sampleSize} 則回答）
            </p>
          </div>

          {/* Sentiment bar */}
          <SentimentBar pos={data.positive} neu={data.neutral} neg={data.negative} />

          {/* Themes */}
          {data.themes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">主題</p>
              <ul className="space-y-1.5">
                {data.themes.map((t, i) => (
                  <li key={i} className="rounded bg-white p-2 border border-[#126b8a]/15">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{t.label}</span>
                      <FreqBadge freq={t.frequency} />
                    </div>
                    {t.examples.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {t.examples.map((ex, j) => (
                          <li key={j} className="text-xs text-slate-500 italic">
                            「{ex}」
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SentimentBar({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1;
  const posPct = (pos / total) * 100;
  const neuPct = (neu / total) * 100;
  const negPct = (neg / total) * 100;
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-slate-200">
        {posPct > 0 && <div className="bg-green-400" style={{ width: `${posPct}%` }} title={`正向 ${pos}`} />}
        {neuPct > 0 && <div className="bg-slate-300" style={{ width: `${neuPct}%` }} title={`中性 ${neu}`} />}
        {negPct > 0 && <div className="bg-red-400" style={{ width: `${negPct}%` }} title={`負向 ${neg}`} />}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-green-700">😊 正向 {pos}</span>
        <span className="text-slate-600">😐 中性 {neu}</span>
        <span className="text-red-700">😟 負向 {neg}</span>
      </div>
    </div>
  );
}

function FreqBadge({ freq }: { freq: 'high' | 'medium' | 'low' }) {
  const cfg = {
    high: { label: '高頻', cls: 'bg-[#126b8a] text-white' },
    medium: { label: '中頻', cls: 'bg-amber-400 text-amber-900' },
    low: { label: '低頻', cls: 'bg-slate-200 text-slate-700' },
  }[freq];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── AI Insights Panel ──────────────────────────────────────────────────────

function AiInsightsPanel({ surveyId, totalResponses }: { surveyId: string; totalResponses: number }) {
  const [enabled, setEnabled] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useSurveyAiInsights(surveyId, enabled);

  const handleGenerate = () => {
    if (!enabled) {
      setEnabled(true);
    } else {
      // 已生成過 → 強制重新請求
      queryClient.removeQueries({ queryKey: ['surveys', surveyId, 'ai-insights'] });
      refetch();
    }
  };

  return (
    <section className="relative overflow-hidden rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.04] to-[#8B5CF6]/[0.03] p-5">
      {/* 裝飾光暈 */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#126b8a] to-[#8B5CF6] text-white">
            <SparkleIcon />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">AI 洞察報告</h2>
            <p className="text-[11px] text-slate-500">由 Z.ai LLM 分析填答結果生成</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading || isFetching}
          className="shrink-0 rounded-md bg-[#126b8a] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isLoading || isFetching ? '分析中…' : enabled ? '重新生成' : '生成洞察'}
        </button>
      </div>

      {!enabled && !data && (
        <div className="relative rounded-md border border-dashed border-[#126b8a]/30 bg-white/40 p-4 text-center">
          <p className="text-sm text-slate-600">
            點擊上方「生成洞察」由 AI 分析這 {totalResponses} 份填答的關鍵發現
          </p>
          <p className="mt-1 text-xs text-slate-400">使用本地化大語言模型（Z.ai GLM-5.1）</p>
        </div>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
          <p className="text-xs text-slate-500 mt-2">⏳ LLM 分析中，通常需要 5-15 秒…</p>
        </div>
      )}

      {error && (
        <div className="relative rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          產生洞察失敗，請稍後再試
        </div>
      )}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-4">
          {/* Summary */}
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">總體洞察</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{data.summary}</p>
          </div>

          {/* Findings */}
          {data.keyFindings.length > 0 && (
            <InsightList
              label="主要發現"
              icon="📊"
              items={data.keyFindings}
              accent="green"
            />
          )}

          {/* Concerns */}
          {data.concerns.length > 0 && (
            <InsightList
              label="注意事項"
              icon="⚠️"
              items={data.concerns}
              accent="amber"
            />
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <InsightList
              label="建議下一步"
              icon="🎯"
              items={data.recommendations}
              accent="blue"
            />
          )}

          <p className="text-right text-[10px] text-slate-400">
            樣本 {data.sampleSize} 份 · 生成於 {new Date(data.generatedAt).toLocaleString('zh-TW')}
          </p>
        </div>
      )}
    </section>
  );
}

function InsightList({ label, icon, items, accent }: {
  label: string;
  icon: string;
  items: string[];
  accent: 'green' | 'amber' | 'blue';
}) {
  const accentClass = {
    green: 'border-l-green-400 bg-green-50/60',
    amber: 'border-l-amber-400 bg-amber-50/60',
    blue: 'border-l-[#126b8a] bg-[#126b8a]/[0.06]',
  }[accent];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
        {icon} {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className={`border-l-2 ${accentClass} pl-3 py-1.5 pr-2 text-sm text-slate-700 rounded-r`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Quality Distribution Panel（Phase 3：問券方乾淨樣本透明化）──────────────

function QualityDistributionPanel({ data }: { data: QualityDistribution }) {
  const audited = data.total - data.unaudited;
  const passedPct = data.total > 0 ? (data.passed / data.total) * 100 : 0;
  const suspiciousPct = data.total > 0 ? (data.suspicious / data.total) * 100 : 0;
  const rejectedPct = data.total > 0 ? (data.rejected / data.total) * 100 : 0;
  const unauditedPct = data.total > 0 ? (data.unaudited / data.total) * 100 : 0;

  return (
    <section className="rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.04] p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">📊 樣本品質分布</h2>
          <p className="text-[11px] text-slate-500">由 AI 品質審核管線分類，可一鍵匯出乾淨樣本</p>
        </div>
        {data.avgScore !== null && (
          <div className="text-right">
            <div className={`text-2xl font-extrabold ${
              data.avgScore >= 80 ? 'text-green-600' :
              data.avgScore >= 60 ? 'text-amber-600' :
              'text-red-600'
            }`}>{data.avgScore}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">平均品質分</div>
          </div>
        )}
      </div>

      {/* Phase V: recharts donut + 保留 bar 線型 + legend cells */}
      <div className="grid gap-3 md:grid-cols-[1fr,200px] items-center">
        <div>
          {/* Bar */}
          <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-200 bg-white">
            {passedPct > 0 && <div className="bg-green-400 transition-all" style={{ width: `${passedPct}%` }} title={`通過 ${data.passed}`} />}
            {suspiciousPct > 0 && <div className="bg-amber-300 transition-all" style={{ width: `${suspiciousPct}%` }} title={`疑似 ${data.suspicious}`} />}
            {rejectedPct > 0 && <div className="bg-red-400 transition-all" style={{ width: `${rejectedPct}%` }} title={`退件 ${data.rejected}`} />}
            {unauditedPct > 0 && <div className="bg-slate-200 transition-all" style={{ width: `${unauditedPct}%` }} title={`未審核 ${data.unaudited}`} />}
          </div>
          {/* Legend */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <LegendCell color="bg-green-400" label="通過" count={data.passed} total={data.total} />
            <LegendCell color="bg-amber-300" label="疑似" count={data.suspicious} total={data.total} />
            <LegendCell color="bg-red-400" label="退件" count={data.rejected} total={data.total} />
            <LegendCell color="bg-slate-200" label="未審核" count={data.unaudited} total={data.total} />
          </div>
        </div>
        <QualityDonut
          passed={data.passed}
          suspicious={data.suspicious}
          rejected={data.rejected}
          unaudited={data.unaudited}
        />
      </div>

      {audited === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          ⚠️ 還沒有任何樣本完成 AI 品質審核。
        </p>
      )}
    </section>
  );
}

function LegendCell({ color, label, count, total }: {
  color: string; label: string; count: number; total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">{count}</span>
      <span className="text-slate-400">({pct}%)</span>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
    </svg>
  );
}
