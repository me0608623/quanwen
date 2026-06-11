'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Presentation,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/token';
import { useSurvey, useSurveyTrend, useSavedAiInsights, useGenerateAiInsights, useQuestionSentiment, useRespondents, useAiUsage, useSurveyLottery, useDrawSurveyLottery, useFulfillSurveyLottery, useFulfillSurveyLotteryWinner, usePauseSurvey, useCloseSurvey, usePublishSurvey, type ReportType, type SurveyAiInsights } from '@/hooks/use-surveys';
import { useSaveScaleSettings, useScaleReliability } from '@/hooks/use-analytics';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { BatchAnalysisResult } from '@/hooks/use-analytics';
import { usePointsSummary } from '@/hooks/use-wallet';
import { BatchAnalysisModal } from '@/components/stats/batch-analysis-modal';
import { OptionBarChart, QualityDonut, RatingDistribution } from '@/components/stats/charts';
import { TrendLineChart } from '@/components/stats/trend-chart';
import { CrossTabSection } from '@/components/stats/cross-tab-panel';
import { NpsSection } from '@/components/stats/nps-gauge';
import { CorrelationSection } from '@/components/stats/correlation-panel';
import { GroupComparisonSection } from '@/components/stats/group-comparison-panel';
import { RegressionSection } from '@/components/stats/regression-panel';
import { SegmentationSection } from '@/components/stats/segmentation-panel';
import { AiReportExport } from '@/components/stats/ai-report-export';
import { StatsPageSkeleton, StatsPanelSkeleton, PanelSkeletonContent } from '@/components/stats/panel-skeleton';
import { EmptyCapabilityCard } from '@/components/stats/empty-capability-card';

interface OptionCount { optionId: string; label: string; count: number }
interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
  totalAnswers: number;
  optionCounts?: OptionCount[];
  averageRating?: number | null;
  ratingMin?: number;
  ratingMax?: number;
  ratingBuckets?: Array<{ value: number; count: number }>;
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
  targetCount: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  lotteryWinnerCount?: number | null;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual' | null;
  lotteryDrawAt?: string | null;
  lotteryDrawnAt?: string | null;
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

// ─── 趨勢圖（recharts AreaChart）──────────────────────────────────────────────

function TrendChart({ surveyId }: { surveyId: string }) {
  const { data: trend = [], isLoading } = useSurveyTrend(surveyId);

  if (isLoading) {
    return <StatsPanelSkeleton minHeight={172} label="近 14 天填答趨勢" />;
  }

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        近 14 天填答趨勢
      </h2>
      <TrendLineChart data={trend} />
    </section>
  );
}

// ─── Respondents Panel（受訪者清單，匿名化 token）───────────────────────────

function RespondentsPanel({ surveyId, totalResponses }: { surveyId: string; totalResponses: number }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useRespondents(surveyId, page, pageSize);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const STATUS_LABELS: Record<string, string> = {
    submitted: '已提交',
    rewarded: '已獎勵',
    rejected: '已退件',
    pending_review: '待審核',
  };
  const STATUS_CLS: Record<string, string> = {
    submitted: 'bg-green-100 text-green-700',
    rewarded: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700',
    pending_review: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        受訪者清單（匿名化） · 共 {data?.total ?? totalResponses} 人
      </h2>

      {isLoading && <PanelSkeletonContent rows={3} />}

      {data && data.respondents.length === 0 && (
        <p className="text-sm text-muted-foreground">尚無受訪者資料</p>
      )}

      {data && data.respondents.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">匿名代碼</th>
                  <th className="pb-2 text-left font-medium">狀態</th>
                  <th className="pb-2 text-left font-medium">提交時間</th>
                  <th className="pb-2 text-right font-medium">填答時長</th>
                  <th className="pb-2 text-right font-medium">品質分</th>
                </tr>
              </thead>
              <tbody>
                {data.respondents.map((r) => (
                  <tr key={r.anonymousToken + r.submittedAt} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-mono text-xs">{r.anonymousToken}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-TW') : '—'}
                    </td>
                    <td className="py-2 text-right text-muted-foreground text-xs">
                      {r.fillDurationSeconds != null ? `${Math.round(r.fillDurationSeconds)}s` : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {r.qualityScore != null ? (
                        <span className={`font-semibold ${r.qualityScore >= 80 ? 'text-green-600' : r.qualityScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {r.qualityScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 sm:hidden">
            {data.respondents.map((r) => (
              <div key={r.anonymousToken + r.submittedAt} className="rounded-lg border border-border/60 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{r.anonymousToken}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-TW') : '—'}</span>
                  <span>
                    {r.fillDurationSeconds != null ? `${Math.round(r.fillDurationSeconds)}s` : '—'}
                    {r.qualityScore != null && (
                      <span className={`ml-2 font-semibold ${r.qualityScore >= 80 ? 'text-green-600' : r.qualityScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        Q:{r.qualityScore}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                第 {data.page} / {totalPages} 頁
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  上一頁
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一頁
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '單選',
  multiple_choice: '多選',
  text: '問答',
  rating: '評分',
  numeric: '數字',
  yes_no: '是/否',
  dropdown: '下拉選單',
};

export default function SurveyStatsPage() {
  const { id } = useParams<{ id: string }>();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchAnalysisResult | undefined>();
  const { data: aiUsage } = useAiUsage();
  const { data: pointsSummary } = usePointsSummary();
  const [linkCopied, setLinkCopied] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const pauseSurvey = usePauseSurvey();
  const closeSurvey = useCloseSurvey();
  const republishSurvey = usePublishSurvey();
  const { data: survey } = useSurvey(id);

  const handlePause = async () => {
    try {
      await pauseSurvey.mutateAsync(id);
      setShowPauseConfirm(false);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '下架失敗，請稍後再試。');
    }
  };

  const handleClose = async () => {
    try {
      await closeSurvey.mutateAsync(id);
      setShowCloseConfirm(false);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '結案失敗，請稍後再試。');
    }
  };

  const handleRepublish = async () => {
    try {
      await republishSurvey.mutateAsync(id);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '重新上架失敗，請稍後再試。');
    }
  };

  const copyPublicLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/s/${id}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    }).catch(() => {});
  };
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

  const handleExportStatsXlsx = (cleanOnly = false) =>
    downloadBinary(
      `/surveys/${id}/export.stats.xlsx${cleanOnly ? '?clean=1' : ''}`,
      cleanOnly ? `survey_${id}_jasp_spss_clean.xlsx` : `survey_${id}_jasp_spss.xlsx`,
    );

  const handleExportJson = () =>
    downloadBinary(`/surveys/${id}/export.json`, `survey_${id}_responses.json`);

  if (isLoading) return <StatsPageSkeleton />;
  if (!stats) return <div className="p-10 text-sm text-destructive">無法取得統計資料</div>;

  const qualityScore = stats.qualityDistribution?.avgScore;
  const auditedResponses = stats.qualityDistribution
    ? stats.qualityDistribution.total - stats.qualityDistribution.unaudited
    : 0;
  const chartQuestions = stats.questionStats.filter((q) =>
    (q.optionCounts && q.optionCounts.length > 0) || q.averageRating !== undefined,
  ).length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F2A5C] via-[#126b8a] to-[#8B5CF6] p-6 text-white shadow-lg md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button onClick={() => router.push('/dashboard')} className="inline-flex items-center gap-1.5 text-xs font-medium text-white/75 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              返回我的問卷
            </button>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Survey Analytics Workspace</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight md:text-4xl">{stats.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
              集中查看回收進度、樣本品質、量化圖表與 AI 洞察，將填答資料整理成可採取行動的結論。
            </p>
            {survey?.status === 'paused' && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-semibold text-yellow-200">
                ⏸ 問卷已暫停，填答者目前無法作答
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={copyPublicLink}
                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                {linkCopied ? '已複製!' : '🔗 複製公開連結'}
              </button>
              {survey?.status !== 'paused' && (
                <a
                  href={`/s/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  開啟填答頁 ↗
                </a>
              )}
              <Link
                href={`/dashboard/surveys/${id}?edit=1`}
                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                title="可修改標題、說明、圖片、樣式、感謝頁與受眾條件；題目與獎勵已鎖定"
              >
                ✏️ 編輯問卷資訊
              </Link>
              {survey?.status === 'paused' && (
                <button
                  type="button"
                  onClick={handleRepublish}
                  disabled={republishSurvey.isPending}
                  className="rounded-md border border-green-300/60 bg-green-400/20 px-3 py-1.5 text-xs font-medium text-green-100 hover:bg-green-400/30 disabled:opacity-60"
                >
                  {republishSurvey.isPending ? '上架中…' : '▶ 重新上架'}
                </button>
              )}
              {survey?.status === 'published' && (
                <button
                  type="button"
                  onClick={() => setShowPauseConfirm(true)}
                  className="rounded-md border border-yellow-300/60 bg-yellow-400/20 px-3 py-1.5 text-xs font-medium text-yellow-100 hover:bg-yellow-400/30"
                >
                  ⏸ 下架/暫停
                </button>
              )}
              {(survey?.status === 'published' || survey?.status === 'paused') && (
                <button
                  type="button"
                  onClick={() => setShowCloseConfirm(true)}
                  className="rounded-md border border-red-300/60 bg-red-400/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-400/30"
                >
                  🔒 結案
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]">
            <HeroMetric icon={Users} label="有效樣本" value={`${stats.totalResponses}`} suffix="份" />
            <HeroMetric icon={BarChart3} label="題目數" value={`${stats.questionStats.length}`} suffix="題" />
            <HeroMetric icon={ShieldCheck} label="平均品質" value={qualityScore == null ? '—' : `${qualityScore}`} suffix={qualityScore == null ? '' : '分'} />
            <HeroMetric icon={CheckCircle2} label="已審核" value={`${auditedResponses}`} suffix="份" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-900">分析工具列</p>
          <p className="mt-0.5 text-xs text-slate-500">匯出原始資料、乾淨樣本，或往下查看 AI 分析簡報。</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          {/* 原始資料 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">原始資料</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExportCsv(false)}
                className="flex flex-col items-start rounded-lg border border-border px-3 py-2 text-left text-xs font-medium hover:bg-muted"
                aria-label="下載 CSV：全部填答，程式用"
              >
                <span className="inline-flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> CSV</span>
                <span className="mt-0.5 text-[10px] font-normal text-slate-400">全部填答 · 程式用</span>
              </button>
              <button
                onClick={handleExportJson}
                className="flex flex-col items-start rounded-lg border border-border px-3 py-2 text-left text-xs font-medium hover:bg-muted"
                aria-label="下載 JSON：結構化格式，程式 / 資料分析用"
              >
                <span>{'{ } JSON'}</span>
                <span className="mt-0.5 text-[10px] font-normal text-slate-400">全部填答 · 程式用</span>
              </button>
            </div>
          </div>

          {/* 給人看（原始文字 Excel） */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">給人看（原始文字）</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExportXlsx(false)}
                className="flex flex-col items-start rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-left text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                aria-label="下載 Excel：全部填答，含填答資料與摘要兩個工作表"
              >
                <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</span>
                <span className="mt-0.5 text-[10px] font-normal text-emerald-600/80">全部填答</span>
              </button>
              <button
                onClick={() => handleExportXlsx(true)}
                className="flex flex-col items-start rounded-lg border border-[#126b8a] bg-[#126b8a] px-3 py-2 text-left text-xs font-semibold text-white hover:bg-[#0f5d78]"
                aria-label="下載乾淨 Excel：僅品質分數 70 分以上的高品質樣本"
              >
                <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> 乾淨 Excel</span>
                <span className="mt-0.5 text-[10px] font-normal text-white/70">僅品質 ≥ 70</span>
              </button>
            </div>
          </div>

          {/* 統計軟體（數值編碼） */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">統計軟體（數值編碼）</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExportStatsXlsx(false)}
                className="flex flex-col items-start rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-left text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                aria-label="下載 JASP/SPSS 格式 Excel：數值編碼、Value Labels、多選題 0/1 拆欄，全部填答"
              >
                <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> JASP / SPSS</span>
                <span className="mt-0.5 text-[10px] font-normal text-indigo-600/80">全部填答 · 0/1 拆欄</span>
              </button>
              <button
                onClick={() => handleExportStatsXlsx(true)}
                className="flex flex-col items-start rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-indigo-700"
                aria-label="下載乾淨 JASP/SPSS 格式 Excel：僅品質分數 70 分以上，數值編碼、Value Labels、0/1 拆欄"
              >
                <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> 乾淨 JASP/SPSS</span>
                <span className="mt-0.5 text-[10px] font-normal text-white/70">僅品質 ≥ 70</span>
              </button>
            </div>
          </div>

          {/* 報表 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">報表</p>
            <button
              onClick={handleExportPdf}
              className="flex flex-col items-start rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-left text-xs font-medium text-rose-800 hover:bg-rose-100"
              aria-label="下載 PDF 統計總覽報表，閱讀用"
            >
              <span>PDF 報表</span>
              <span className="mt-0.5 text-[10px] font-normal text-rose-600/80">統計總覽（閱讀用）</span>
            </button>
          </div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-600">
        <a href="#ai-insights" className="rounded-lg px-3 py-2 hover:bg-white hover:text-[#126b8a]">AI 洞察簡報</a>
        <a href="#quality" className="rounded-lg px-3 py-2 hover:bg-white hover:text-[#126b8a]">樣本品質</a>
        <a href="#trend" className="rounded-lg px-3 py-2 hover:bg-white hover:text-[#126b8a]">回收趨勢</a>
        <a href="#advanced" className="rounded-lg px-3 py-2 hover:bg-white hover:text-[#126b8a]">進階統計</a>
        <a href="#questions" className="rounded-lg px-3 py-2 hover:bg-white hover:text-[#126b8a]">逐題圖表</a>
      </nav>

      {stats.rewardMode === 'lottery' && (
        <LotteryPanel surveyId={id} stats={stats} />
      )}

      {/* Quality Distribution（品質審核分布）*/}
      {stats.qualityDistribution && stats.qualityDistribution.total > 0 && (
        <div id="quality"><QualityDistributionPanel data={stats.qualityDistribution} /></div>
      )}

      {/* AI 洞察 */}
      <div id="ai-insights" className="space-y-3">
        <AiInsightsPanel surveyId={id} surveyTitle={stats.title} totalResponses={stats.totalResponses} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setBatchOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#126b8a]/40 bg-[#126b8a]/5 px-4 py-2 text-xs font-semibold text-[#126b8a] hover:bg-[#126b8a]/10"
          >
            ⚡ 批次統計分析
          </button>
        </div>
        {batchResults && (
          <BatchResultsSummary results={batchResults} />
        )}
        <BatchAnalysisModal
          surveyId={id}
          questionStats={stats.questionStats}
          aiRemaining={aiUsage?.remaining.analyzeResponses ?? 0}
          pointsBalance={pointsSummary?.balance ?? 0}
          open={batchOpen}
          onClose={(results) => {
            setBatchOpen(false);
            if (results) setBatchResults(results);
          }}
        />
      </div>

      {/* 趨勢圖 */}
      <div id="trend"><TrendChart surveyId={id} /></div>

      {/* 交叉分析 */}
      <div id="advanced" className="space-y-6">
        <section className="rounded-xl border border-[#126b8a]/20 bg-[#126b8a]/[0.04] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#126b8a]">進階量化分析</p>
          <p className="mt-1 text-sm text-slate-600">
            目前有 {chartQuestions} 題可直接視覺化。你也可以執行交叉分析、信度（Cronbach&apos;s α）、NPS、相關性、差異性檢定（t / ANOVA）、迴歸與分群，找出更深層的受訪者差異。統計皆由系統精確計算，可加購「AI 白話解讀」（耗 AI 分析額度）。
          </p>
        </section>
        <CrossTabSection questionStats={stats.questionStats} surveyId={id} />

        <ScaleReliabilityPanel surveyId={id} />

        {/* NPS 淨推薦值 */}
        <NpsSection questionStats={stats.questionStats} surveyId={id} />

        {/* 相關性分析 */}
        <CorrelationSection questionStats={stats.questionStats} surveyId={id} />

        {/* 差異性分析（t 檢定 / ANOVA） */}
        <GroupComparisonSection questionStats={stats.questionStats} surveyId={id} />

        {/* 迴歸分析 */}
        <RegressionSection questionStats={stats.questionStats} surveyId={id} />

        {/* 分群分析 */}
        <SegmentationSection surveyId={id} questionStats={stats.questionStats} />

        {/* AI 品質建議（純建議，不影響上架） */}
        <AiQualityAdviceSection surveyId={id} />
      </div>

      {/* 受訪者清單（匿名化 token） */}
      <RespondentsPanel surveyId={id} totalResponses={stats.totalResponses} />

      {/* 題目統計 */}
      <div id="questions" className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#126b8a]">逐題量化圖表</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">每一題的回答分布</h2>
      </div>
      {stats.questionStats.map((q, i) => (
        <section key={q.questionId} className="rounded-lg border border-border p-5 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Q{i + 1} · {QUESTION_TYPE_LABELS[q.type] ?? q.type}</p>
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
              <span className="text-sm text-muted-foreground">平均分（滿 {q.ratingMax ?? 5} 分）</span>
            </div>
          )}
          {q.ratingBuckets && q.ratingBuckets.length > 0 && (
            <RatingDistribution buckets={q.ratingBuckets} />
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
      </div>

      {/* 下架/暫停確認 modal */}
      {showPauseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPauseConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">確認下架/暫停問卷</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              暫停後填答者<strong>無法作答</strong>，問卷從任務列表移除。預算維持鎖定，可隨時重新上架。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPauseConfirm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePause}
                disabled={pauseSurvey.isPending}
                className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-60"
              >
                {pauseSurvey.isPending ? '處理中…' : '確認下架'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 結案確認 modal */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">確認結案</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              結案後<strong>永久無法再收答</strong>，問卷將進入統計分析模式。未用預算將退回錢包（cashBalance）。
            </p>
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              ⚠️ 此操作<strong>不可撤銷</strong>，結案後無法重新上架。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={closeSurvey.isPending}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                {closeSurvey.isPending ? '結案中…' : '確認結案'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LotteryPanel({ surveyId, stats }: { surveyId: string; stats: SurveyStats }) {
  const [fulfillmentNote, setFulfillmentNote] = useState('');
  const [winnerNotes, setWinnerNotes] = useState<Record<string, string>>({});
  const { data } = useSurveyLottery(surveyId);
  const draw = useDrawSurveyLottery(surveyId);
  const fulfill = useFulfillSurveyLottery(surveyId);
  const fulfillWinner = useFulfillSurveyLotteryWinner(surveyId);
  const drawnAt = data?.drawnAt ?? stats.lotteryDrawnAt;
  const canDraw = stats.lotteryDrawMode === 'manual' && stats.totalResponses >= stats.targetCount && !drawnAt;
  const drawModeLabel = stats.lotteryDrawMode === 'scheduled'
    ? `指定日期：${stats.lotteryDrawAt ? new Date(stats.lotteryDrawAt).toLocaleString('zh-TW') : '尚未設定'}`
    : stats.lotteryDrawMode === 'manual'
      ? '收滿後由建立者手動開獎'
      : '收滿後自動開獎';
  const pendingFulfillment = data?.winners.some((winner) => winner.fulfillmentStatus === 'pending') ?? false;
  const verifiedCount = data?.winners.filter((winner) => winner.fulfillmentStatus === 'verified').length ?? 0;

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Lottery Reward</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">抽獎回饋：{stats.lotteryPrize}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {stats.lotteryWinnerCount} 個中獎名額 · {drawModeLabel}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {drawnAt
              ? `已於 ${new Date(drawnAt).toLocaleString('zh-TW')} 完成開獎。結果通知已送達 ${data?.notifiedParticipantCount ?? 0} / ${data?.participantCount ?? stats.totalResponses} 位有效填答者。`
              : `目前收集 ${stats.totalResponses} / ${stats.targetCount} 份，開獎後系統會通知所有有效填答者結果。`}
          </p>
          {drawnAt && (
            <p className="mt-2 text-xs font-medium text-amber-800">
              建立者有義務完成獎品交付。平台保留通知與核驗紀錄，履約期限：
              {data?.fulfillmentDueAt ? new Date(data.fulfillmentDueAt).toLocaleString('zh-TW') : '開獎後七日內'}。
              義務通知：{data?.creatorObligationNotifiedAt ? '已送達' : '等待系統補送'}。
            </p>
          )}
          {data?.drawSeed && data.eligibleDigest && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3 text-[11px] text-slate-600">
              <p className="font-semibold text-amber-800">
                可重播抽獎稽核證明 · {data.drawAuditVerified ? '核對通過' : '核對異常'}
              </p>
              <p className="mt-1 break-all font-mono">候選摘要：{data.eligibleDigest}</p>
              <p className="mt-1 break-all font-mono">抽獎種子：{data.drawSeed}</p>
            </div>
          )}
        </div>
        {stats.lotteryDrawMode === 'manual' && !drawnAt && (
          <button
            type="button"
            disabled={!canDraw || draw.isPending}
            onClick={() => draw.mutate()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {draw.isPending ? '開獎中…' : canDraw ? '立即開獎並通知' : '收滿後可開獎'}
          </button>
        )}
      </div>
      {drawnAt && data && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4">
          <p className="text-sm font-semibold text-slate-900">中獎履約進度</p>
          <p className="mt-1 text-xs text-slate-600">
            共 {data.actualWinnerCount} 位中獎者，平台已核驗 {verifiedCount} 位。
          </p>
          {pendingFulfillment && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">
                官方送達通道是平台站內通知。電子券可在逐筆說明填入各自兌換碼；實體獎品請填寫領取、寄送或客服聯絡流程，平台會保存這段履約證據。
              </p>
              <textarea
                value={fulfillmentNote}
                onChange={(event) => setFulfillmentNote(event.target.value)}
                placeholder="可選：套用給所有待履約中獎者。例如：請於七日內依通知內容回覆領取資訊，客服將協助安排餐券寄送。"
                className="min-h-20 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={fulfillmentNote.trim().length < 5 || fulfill.isPending}
                onClick={() => fulfill.mutate(fulfillmentNote, { onSuccess: () => setFulfillmentNote('') })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {fulfill.isPending ? '送出中…' : '套用並通知所有待履約者'}
              </button>
            </div>
          )}
          {!pendingFulfillment && (
            <p className="mt-3 text-xs text-emerald-700">
              已送出兌獎說明，通知已送達 {data.winners.filter((winner) => winner.fulfillmentNotifiedAt).length} / {data.actualWinnerCount} 位中獎者，等待平台逐筆核驗。
            </p>
          )}
          <div className="mt-4 space-y-2">
            {data.winners.map((winner, index) => (
              <div key={winner.id} className="rounded-lg border border-amber-100 bg-white p-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">匿名中獎者 #{index + 1}</p>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${
                    winner.platformVerifiedAt
                      ? 'bg-emerald-100 text-emerald-800'
                      : winner.recipientStatus === 'issue_reported'
                        ? 'bg-red-100 text-red-700'
                        : winner.recipientStatus === 'received'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-800'
                  }`}>
                    {winner.platformVerifiedAt
                      ? '平台已核驗'
                      : winner.recipientStatus === 'issue_reported'
                        ? '中獎者已回報問題'
                        : winner.recipientStatus === 'received'
                          ? '中獎者已確認收到'
                          : winner.fulfillmentStatus === 'pending'
                            ? '等待送出兌獎說明'
                            : '等待中獎者確認'}
                  </span>
                </div>
                {winner.recipientIssueNote && (
                  <p className="mt-2 whitespace-pre-wrap rounded-md bg-red-50 p-2 font-semibold text-red-700">
                    中獎者回報：{winner.recipientIssueNote}
                  </p>
                )}
                {(!!winner.platformInterventionHistory?.length || !!winner.platformInterventionNote) && (
                  <div className="mt-2 rounded-md bg-sky-50 p-2 text-sky-800">
                    <p className="font-semibold">平台介入歷程</p>
                    {(winner.platformInterventionHistory?.length
                      ? winner.platformInterventionHistory
                      : [{
                          intervenedAt: winner.platformIntervenedAt ?? '',
                          adminId: '',
                          reason: 'winner_issue' as const,
                          note: winner.platformInterventionNote ?? '',
                        }]
                    ).map((entry, entryIndex) => (
                      <p key={`${entry.intervenedAt}-${entryIndex}`} className="mt-1 whitespace-pre-wrap">
                        {entry.note}
                        <span className="ml-1 text-sky-600">
                          · {entry.reason === 'fulfillment_overdue' ? '逾期主動介入' : '問題回報介入'}
                          {entry.intervenedAt ? ` · ${new Date(entry.intervenedAt).toLocaleString('zh-TW')}` : ''}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                {winner.fulfillmentStatus === 'pending' && (
                  <div className="mt-3 space-y-2 rounded-md bg-amber-50 p-2">
                    <p className="font-semibold text-amber-900">逐筆兌獎通知</p>
                    <textarea
                      value={winnerNotes[winner.id] ?? ''}
                      onChange={(event) => setWinnerNotes((notes) => ({ ...notes, [winner.id]: event.target.value }))}
                      placeholder="例如：電子餐券序號 ABCD-1234，請於 2026/07/31 前至饗食天堂門市兌換。"
                      className="min-h-20 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={(winnerNotes[winner.id]?.trim().length ?? 0) < 5 || fulfillWinner.isPending}
                      onClick={() => fulfillWinner.mutate({
                        resultId: winner.id,
                        note: winnerNotes[winner.id] ?? '',
                      }, {
                        onSuccess: () => setWinnerNotes((notes) => ({ ...notes, [winner.id]: '' })),
                      })}
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {fulfillWinner.isPending ? '送出中…' : '通知這位中獎者'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {draw.isError && <p className="mt-3 text-xs text-red-600">開獎失敗，請稍後再試。</p>}
      {fulfill.isError && <p className="mt-3 text-xs text-red-600">兌獎說明送出失敗，請稍後再試。</p>}
      {fulfillWinner.isError && <p className="mt-3 text-xs text-red-600">逐筆兌獎通知送出失敗，請稍後再試。</p>}
    </section>
  );
}

function ScaleReliabilityPanel({ surveyId }: { surveyId: string }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reverseIds, setReverseIds] = useState<string[]>([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [showAlpha, setShowAlpha] = useState(true);
  const [showOmega, setShowOmega] = useState(true);
  const [showAlphaIfDeleted, setShowAlphaIfDeleted] = useState(true);

  const debouncedSelectedIds = useDebouncedValue(selectedIds, 500);
  const debouncedReverseIds = useDebouncedValue(reverseIds, 500);

  const { data: allData, isLoading } = useScaleReliability(surveyId);
  const saveSettings = useSaveScaleSettings(surveyId);
  const availableItems = allData?.availableItems ?? [];

  const canCalculate = debouncedSelectedIds.length >= 2;
  const { data: liveData, isFetching } = useScaleReliability(
    surveyId,
    debouncedSelectedIds,
    debouncedReverseIds,
    canCalculate,
  );
  const displayData = canCalculate ? (liveData ?? allData) : allData;

  useEffect(() => {
    if (!allData || selectionInitialized) return;
    setSelectedIds(allData.availableItems.filter((item) => item.selectedForScale).map((item) => item.questionId));
    setReverseIds(allData.availableItems.filter((item) => item.reverseScored).map((item) => item.questionId));
    setSelectionInitialized(true);
  }, [allData, selectionInitialized]);

  if (isLoading) return <StatsPanelSkeleton minHeight={200} label="量表信度統計" />;
  if (!allData || availableItems.length < 2) {
    return (
      <EmptyCapabilityCard
        title="量表信度統計"
        description="需要一個多題量表題組（至少 2 題評分題）才能計算 Cronbach's α 與 McDonald's ω。"
      />
    );
  }

  const poolItems = availableItems;
  const isSelected = (id: string) => selectedIds.includes(id);
  const isReversed = (id: string) => reverseIds.includes(id);

  const toggleItem = (id: string) => {
    if (isSelected(id)) {
      setSelectedIds((ids) => ids.filter((i) => i !== id));
      setReverseIds((ids) => ids.filter((i) => i !== id));
    } else {
      setSelectedIds((ids) => [...ids, id]);
    }
  };

  const toggleReverse = (id: string, checked: boolean) => {
    setReverseIds((ids) => (checked ? [...ids, id] : ids.filter((i) => i !== id)));
  };

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">量表信度統計</p>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── 左柱：變數池 ── */}
        <div className="rounded-xl border border-indigo-100 bg-white p-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">變數池</p>
          <div className="space-y-1.5">
            {poolItems.map((item) => (
              <div
                key={item.questionId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-sm text-slate-400" title="評分量表題">📊</span>
                  <span className="truncate text-xs text-slate-700">{item.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleItem(item.questionId)}
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    isSelected(item.questionId)
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {isSelected(item.questionId) ? '已選' : '加入'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 中柱：分析設定 ── */}
        <div className="flex flex-col rounded-xl border border-indigo-100 bg-white p-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">分析設定</p>

          {/* 已選變數 */}
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">已選變數</p>
          {selectedIds.length === 0 ? (
            <p className="mb-3 text-xs text-slate-400">從左側點選「加入」以新增變數</p>
          ) : (
            <div className="mb-3 space-y-1.5">
              {selectedIds.map((id) => {
                const item = availableItems.find((it) => it.questionId === id);
                if (!item) return null;
                return (
                  <div key={id} className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-xs text-slate-700">{item.title}</span>
                      <button
                        type="button"
                        aria-label={`移除 ${item.title}`}
                        onClick={() => toggleItem(id)}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={isReversed(id)}
                        onChange={(e) => toggleReverse(id, e.target.checked)}
                      />
                      反向題
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* 顯示指標 */}
          <div className="border-t border-indigo-100 pt-3">
            <p className="mb-1.5 text-[11px] font-medium text-slate-500">顯示指標</p>
            <div className="space-y-1.5 text-xs text-slate-700">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showAlpha} onChange={(e) => setShowAlpha(e.target.checked)} />
                Cronbach&apos;s α
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showOmega} onChange={(e) => setShowOmega(e.target.checked)} />
                McDonald&apos;s ω
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showAlphaIfDeleted} onChange={(e) => setShowAlphaIfDeleted(e.target.checked)} />
                刪題後信度
              </label>
            </div>
          </div>

          {/* 儲存設定 */}
          <div className="mt-auto border-t border-indigo-100 pt-3">
            <button
              type="button"
              disabled={selectedIds.length < 2 || saveSettings.isPending}
              onClick={() => saveSettings.mutate({ questionIds: selectedIds, reverseQuestionIds: reverseIds })}
              className="w-full rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saveSettings.isPending ? '儲存中…' : '儲存量表設定'}
            </button>
            {saveSettings.isSuccess && <p className="mt-1.5 text-[11px] text-emerald-700">量表設定已保存。</p>}
            {saveSettings.isError && <p className="mt-1.5 text-[11px] text-red-700">儲存失敗，請稍後再試。</p>}
          </div>
        </div>

        {/* ── 右柱：動態報表 ── */}
        <div className="rounded-xl border border-indigo-100 bg-white p-3">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">動態報表</p>

          {selectedIds.length < 2 ? (
            <div className="flex h-28 items-center justify-center">
              <p className="text-center text-xs text-slate-400">請選擇至少兩個變數</p>
            </div>
          ) : isFetching ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 rounded-lg bg-slate-200" />
              <div className="h-10 rounded-lg bg-slate-200" />
              <div className="h-24 rounded-lg bg-slate-200" />
            </div>
          ) : displayData ? (
            <div className="space-y-4">
              {/* α / ω metrics */}
              <div className="flex flex-wrap gap-4">
                {showAlpha && (
                  <div>
                    <p className="text-[11px] text-slate-500">Cronbach&apos;s α</p>
                    <p className="text-2xl font-bold text-slate-900">{displayData.cronbachAlpha ?? '—'}</p>
                  </div>
                )}
                {showOmega && (
                  <div>
                    <p className="text-[11px] text-slate-500">McDonald&apos;s ω</p>
                    <p className="text-2xl font-bold text-slate-900">{displayData.mcdonaldsOmega ?? '—'}</p>
                  </div>
                )}
              </div>

              {/* Interpretation */}
              <p className="text-xs text-slate-600">{displayData.interpretation}</p>
              <p className="text-[11px] text-slate-400">
                {displayData.completeResponseCount} 份完整樣本
                {displayData.excludedIncompleteResponseCount > 0 && (
                  <span className="text-amber-600">・已排除 {displayData.excludedIncompleteResponseCount} 份不完整</span>
                )}
              </p>

              {/* 刪題後信度 */}
              {showAlphaIfDeleted && displayData.items.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">刪題後信度</p>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-1 text-left font-medium text-slate-400">題目</th>
                        <th className="py-1 text-right font-medium text-slate-400">α（刪除後）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.items.map((item) => (
                        <tr key={item.questionId} className="border-b border-slate-50">
                          <td className="py-1 pr-2 text-slate-700">{item.title}</td>
                          <td className="py-1 text-right font-mono text-slate-900">
                            {item.alphaIfDeleted ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {displayData?.normalizedToCommonScale && (
        <p className="mt-3 text-[11px] text-slate-500">
          信度指標均先將各題標準化至共同 0-1 尺度，避免混合量尺扭曲結果；逐題平均保留原量尺，反向題已換算。
        </p>
      )}
    </section>
  );
}

function HeroMetric({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
      <Icon className="h-4 w-4 text-cyan-100" />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {value}
        {suffix && <span className="ml-1 text-xs font-medium text-white/60">{suffix}</span>}
      </p>
    </div>
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

/** AiQuotaGuard 額度用盡回 403 + message='AI feature limit reached' */
function isQuotaError(err: unknown): boolean {
  const resp = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  return resp?.status === 403 && resp?.data?.message === 'AI feature limit reached';
}

function AiInsightsPanel({
  surveyId,
  surveyTitle,
  totalResponses,
}: {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
}) {
  const [reportType, setReportType] = useState<ReportType>('simple');
  const [presentationOpen, setPresentationOpen] = useState(false);
  // 已保存報告(DB 持久化,免費讀取);生成/重新生成才耗額度
  const { data: saved, isLoading: savedLoading } = useSavedAiInsights(surveyId, reportType);
  const generate = useGenerateAiInsights(surveyId);
  const { data: usage } = useAiUsage();

  const handleGenerate = () => generate.mutate(reportType);

  // 切換報告類型:讀取該類型已保存的報告(沒有就顯示「生成報告」提示),不自動耗額度
  const handleSwitchType = (t: ReportType) => {
    if (t === reportType) return;
    generate.reset();
    setReportType(t);
  };

  const data = saved?.report ?? undefined;
  const generatedAt = saved?.generatedAt;
  const enabled = Boolean(data);
  const error = generate.error;
  const busy = generate.isPending || savedLoading;
  const isLoading = generate.isPending;
  const isFetching = false;

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
            <h2 className="font-bold text-slate-900">AI 數據分析報告</h2>
            <p className="text-[11px] text-slate-500">由後端 AI 分析填答結果生成</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={busy}
          className="shrink-0 rounded-md bg-[#126b8a] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {busy ? '分析中…' : enabled ? '重新生成' : '生成報告'}
        </button>
      </div>

      {usage && (
        <p className="relative mb-3 text-[11px] text-slate-500">
          {usage.tier.toUpperCase()} 方案 · 今日 AI 分析剩餘{' '}
          {Number.isFinite(usage.remaining.analyzeResponses) ? usage.remaining.analyzeResponses : '∞'}/
          {Number.isFinite(usage.limits.analyzeResponses) ? usage.limits.analyzeResponses : '∞'} 次
          {generatedAt && (
            <> · 本報告生成於 {new Date(generatedAt).toLocaleString('zh-TW', { hour12: false })}（已自動保存）</>
          )}
        </p>
      )}

      {/* 簡單 / 詳細 報告切換 */}
      <div className="relative mb-3 inline-flex rounded-lg border border-[#126b8a]/20 bg-white/60 p-0.5 text-xs">
        {([
          { key: 'simple' as const, label: '簡單報告', hint: '重點摘要' },
          { key: 'detailed' as const, label: '詳細報告', hint: '逐題 + 交叉 + 方法' },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => handleSwitchType(opt.key)}
            disabled={busy}
            title={opt.hint}
            className={`rounded-md px-3 py-1.5 font-semibold transition-all disabled:opacity-60 ${
              reportType === opt.key
                ? 'bg-[#126b8a] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#126b8a]/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!enabled && !data && (
        <div className="relative rounded-md border border-dashed border-[#126b8a]/30 bg-white/40 p-4 text-center">
          <p className="text-sm text-slate-600">
            選擇「簡單 / 詳細」後點「生成報告」，由 AI 分析這 {totalResponses} 份填答
          </p>
          <p className="mt-1 text-xs text-slate-400">詳細報告含逐題洞察、交叉發現與方法/信賴度說明</p>
        </div>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
          <p className="text-xs text-slate-500 mt-2">
            ⏳ AI {reportType === 'detailed' ? '詳細分析中，可能需要 10-30 秒' : '分析中，通常需要 5-15 秒'}…
          </p>
        </div>
      )}

      {error && (
        <div className="relative rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {isQuotaError(error) ? (
            <>
              今日 AI 分析次數已用完（{usage ? `${usage.tier.toUpperCase()} 方案每日 ${
                Number.isFinite(usage.limits.analyzeResponses) ? usage.limits.analyzeResponses : '∞'
              } 次` : '已達方案上限'}）。明天會自動重置，或{' '}
              <Link href="/dashboard/shop" className="font-semibold underline">
                升級方案
              </Link>{' '}
              取得更多次數。
            </>
          ) : (
            '產生洞察失敗，請稍後再試'
          )}
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

          {/* 詳細報告：逐題洞察 */}
          {data.questionBreakdown && data.questionBreakdown.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                🔍 逐題洞察
              </p>
              <ul className="space-y-2">
                {data.questionBreakdown.map((b, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">{b.question}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{b.insight}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 詳細報告：交叉發現 */}
          {data.crossFindings && data.crossFindings.length > 0 && (
            <InsightList label="交叉關聯發現" icon="🔗" items={data.crossFindings} accent="blue" />
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

          {/* 詳細報告：方法與信賴度 */}
          {data.methodology && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                📐 方法與信賴度
              </p>
              <p className="text-sm leading-relaxed text-slate-600">{data.methodology}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#126b8a]/15 pt-3">
            <p className="text-[10px] text-slate-400">
              {data.reportType === 'detailed' ? '詳細報告' : '簡單報告'} · 樣本 {data.sampleSize} 份 · 生成於 {new Date(data.generatedAt).toLocaleString('zh-TW')}
            </p>
            <div className="flex flex-wrap gap-2">
              <AiReportExport insights={data} surveyTitle={surveyTitle} />
              <button
                type="button"
                onClick={() => setPresentationOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-[#0F2A5C] to-[#8B5CF6] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                <Presentation className="h-3.5 w-3.5" />
                摘要簡報
              </button>
            </div>
          </div>
        </div>
      )}
      {data && presentationOpen && (
        <AiPresentation
          insights={data}
          surveyTitle={surveyTitle}
          onClose={() => setPresentationOpen(false)}
        />
      )}
    </section>
  );
}

function AiPresentation({
  insights,
  surveyTitle,
  onClose,
}: {
  insights: SurveyAiInsights;
  surveyTitle: string;
  onClose: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const slides = [
    {
      eyebrow: 'AI EXECUTIVE SUMMARY',
      title: surveyTitle,
      body: insights.summary,
      items: [`有效樣本 ${insights.sampleSize} 份`, `生成時間 ${new Date(insights.generatedAt).toLocaleString('zh-TW')}`],
    },
    {
      eyebrow: 'KEY FINDINGS',
      title: '資料告訴我們什麼？',
      body: '以下是 AI 從填答中整理出的主要發現。',
      items: insights.keyFindings,
    },
    {
      eyebrow: 'CONCERNS',
      title: '需要留意的訊號',
      body: '在採取決策前，先檢查可能影響解讀的風險。',
      items: insights.concerns.length > 0 ? insights.concerns : ['目前沒有特別需要提醒的風險。'],
    },
    {
      eyebrow: 'NEXT ACTIONS',
      title: '建議下一步',
      body: '將洞察轉成具體行動，讓問卷資料真正產生價值。',
      items: insights.recommendations,
    },
  ];
  const current = slides[slide];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F2A5C] via-[#126b8a] to-[#8B5CF6] p-6 text-white shadow-2xl md:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉摘要簡報"
          className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="relative min-h-[460px]">
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-100">{current.eyebrow}</p>
          <h3 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">{current.title}</h3>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/75">{current.body}</p>
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {current.items.map((item, index) => (
              <li key={`${slide}-${index}`} className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 backdrop-blur-sm">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5">
          <p className="text-xs text-white/60">AI 摘要簡報 · {slide + 1} / {slides.length}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSlide((value) => Math.max(0, value - 1))}
              disabled={slide === 0}
              className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              上一頁
            </button>
            <button
              type="button"
              onClick={() => slide === slides.length - 1 ? onClose() : setSlide((value) => value + 1)}
              className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-[#0F2A5C] transition hover:bg-cyan-50"
            >
              {slide === slides.length - 1 ? '完成' : '下一頁'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
      <div className="grid gap-3 md:grid-cols-[1fr,220px] items-center">
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

// ─── Batch Results Summary ───────────────────────────────────────────────────

function BatchResultsSummary({ results }: { results: BatchAnalysisResult }) {
  const ANALYSIS_LABELS: Record<string, string> = {
    cross_tab: '交叉分析',
    scale_reliability: '量表信度',
    nps: 'NPS',
    correlation: '相關性',
    group_comparison: '差異性',
    regression: '迴歸分析',
    segmentation: '分群分析',
  };

  return (
    <section className="rounded-xl border border-[#126b8a]/30 bg-[#126b8a]/[0.03] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">⚡ 批次 AI 統計分析結果</h2>
        <div className="flex gap-3 text-xs text-slate-500">
          <span>AI 額度：{results.aiUsed} 次</span>
          {results.pointsUsed > 0 && <span>積分：{results.pointsUsed}</span>}
        </div>
      </div>
      <div className="space-y-3">
        {results.results.map((item, i) => (
          <div key={i} className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-bold text-[#126b8a]">
                {ANALYSIS_LABELS[item.analysisType] ?? item.analysisType}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.costType === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {item.costType === 'ai' ? 'AI 額度' : '積分'}
              </span>
            </div>
            {item.summary && (
              <p className="text-xs font-semibold text-slate-700 mb-1">{item.summary}</p>
            )}
            <p className="text-sm leading-relaxed text-slate-600">{item.interpretation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** AI 品質建議卡片 — 發布後背景品質掃描的結果（純建議，不影響上架狀態） */
function AiQualityAdviceSection({ surveyId }: { surveyId: string }) {
  const { data: survey } = useSurvey(surveyId);
  if (!survey || typeof survey.aiScore !== 'number') return null;

  const score = survey.aiScore;
  const tone = score >= 80
    ? { badge: 'bg-emerald-100 text-emerald-800', label: '品質良好' }
    : score >= 60
      ? { badge: 'bg-amber-100 text-amber-800', label: '尚可，可再優化' }
      : { badge: 'bg-red-100 text-red-700', label: '建議改善' };

  return (
    <section className="rounded-lg border border-border p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          🤖 AI 品質建議
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>
          {score} 分 · {tone.label}
        </span>
      </div>
      {survey.aiRejectReason ? (
        <p className="text-sm leading-relaxed text-foreground">{survey.aiRejectReason}</p>
      ) : (
        <p className="text-sm text-muted-foreground">AI 掃描未發現需要改善的問題。</p>
      )}
      <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
        此為發布後 AI 自動掃描的參考建議，僅供優化問卷品質，不影響問卷上架與填答。
        修改題目後重新發布可獲得新的評估。
      </p>
    </section>
  );
}
