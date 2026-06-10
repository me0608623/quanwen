'use client';

import { useEffect, useState } from 'react';
import gsap from 'gsap';
import { relativeTime } from '@/lib/relative-time';
import { toCsv } from '@/lib/to-csv';
import Link from 'next/link';
import { useMySurveys, useDeleteSurvey, useDuplicateSurvey, useSurveyorAssistant, SURVEY_CATEGORY_LABELS } from '@/hooks/use-surveys';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '審核中',
  published: '上架中',
  paused: '已暫停',
  closed: '已截止',
  rejected: '已退回',
};

const STATUS_BG: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  paused: 'bg-orange-100 text-orange-700',
  closed: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-100 text-red-700',
};

export default function DashboardPage() {
  const { data: surveys = [], isLoading, isError, refetch: refetchSurveys } = useMySurveys();
  const deleteSurvey = useDeleteSurvey();
  const duplicateSurvey = useDuplicateSurvey();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'pending_review' | 'published' | 'closed'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'reward' | 'responses'>('newest');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [surveyLimit, setSurveyLimit] = useState(PAGE_SIZE);

  const copyShareLink = (id: string) => {
    const url = `${window.location.origin}/s/${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    }).catch(() => {});
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('qw_dash_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (['newest', 'reward', 'responses'].includes(p.sortBy)) setSortBy(p.sortBy);
        if (['all', 'draft', 'pending_review', 'published', 'closed'].includes(p.statusFilter)) setStatusFilter(p.statusFilter);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('qw_dash_prefs', JSON.stringify({ sortBy, statusFilter }));
    } catch {
      /* ignore */
    }
  }, [sortBy, statusFilter]);

  // Reset pagination when filters change
  useEffect(() => { setSurveyLimit(PAGE_SIZE); }, [statusFilter, sortBy, query]);

  // KPI 計算（從 surveys list 直接算）
  const totalSurveys = surveys.length;
  const publishedCount = surveys.filter((s) => s.status === 'published').length;
  // 2026-06-06 改版後發布即上架，pending_review 僅剩舊資料；KPI 改顯示草稿數
  const draftCount = surveys.filter((s) => s.status === 'draft').length;
  const totalResponses = surveys.reduce((sum, s) => sum + (s.completedCount ?? 0), 0);
  const totalTarget = surveys.reduce((sum, s) => sum + (s.targetCount ?? 0), 0);
  const avgCompletion = totalTarget > 0 ? Math.round((totalResponses / totalTarget) * 100) : 0;
  const q = query.trim().toLowerCase();
  const filteredSurveys = surveys
    .filter((s) => statusFilter === 'all' || s.status === statusFilter)
    .filter((s) => !q || s.title.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'reward') return (b.rewardPoints ?? 0) - (a.rewardPoints ?? 0);
      if (sortBy === 'responses') return (b.completedCount ?? 0) - (a.completedCount ?? 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  // 上架中問卷的鎖定預算（每份獎勵 × 目標份數；抽獎型 rewardPoints 為 0 不計）
  const lockedBudget = surveys
    .filter((s) => s.status === 'published')
    .reduce((sum, s) => sum + (s.rewardPoints ?? 0) * (s.targetCount ?? 0), 0);

  const exportCsv = () => {
    const rows: string[][] = [['標題', '狀態', '完成', '目標', '每份獎勵(NT$)', '建立日期']];
    for (const s of filteredSurveys) {
      rows.push([
        s.title,
        STATUS_LABELS[s.status] ?? s.status,
        String(s.completedCount ?? 0),
        String(s.targetCount ?? 0),
        String(s.rewardPoints ?? 0),
        new Date(s.createdAt).toLocaleDateString('zh-TW'),
      ]);
    }
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `我的問卷_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">我的問卷</h1>
          <p className="text-sm text-muted-foreground mt-1">管理你發布的問卷、追蹤回收進度</p>
        </div>
        <div className="flex items-center gap-2">
          {surveys.length > 0 && (
            <button
              onClick={exportCsv}
              className="rounded-[10px] border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:bg-muted"
              title="匯出目前清單為 CSV"
            >
              匯出 CSV
            </button>
          )}
          <Link
            href="/dashboard/surveys/import"
            className="rounded-[10px] border border-[#126b8a]/40 px-4 py-2.5 text-sm font-semibold text-[#126b8a] transition-all hover:bg-[#126b8a]/5"
          >
            匯入問卷
          </Link>
          <Link
            href="/dashboard/surveys/new"
            className="rounded-[10px] bg-[#126b8a] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78]"
          >
            + 新增問卷
          </Link>
        </div>
      </div>

      {/* AI 助手 */}
      {!isLoading && surveys.length > 0 && <AssistantCard />}

      {/* KPI cards */}
      {!isLoading && surveys.length > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-4">
          <Kpi label="問卷總數" value={totalSurveys} suffix="份" />
          <Kpi
            label="上架中"
            value={publishedCount}
            suffix="份"
            extra={lockedBudget > 0 ? `鎖定預算 NT$${lockedBudget.toLocaleString()}` : undefined}
            accent="green"
          />
          <Kpi label="草稿" value={draftCount} suffix="份" accent="yellow" />
          <Kpi label="累計回收" value={totalResponses} extra={`完成率 ${avgCompletion}%`} accent="blue" />
        </div>
      )}

      {isLoading && (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-background p-4">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">問卷載入失敗。</p>
          <button
            onClick={() => refetchSurveys()}
            className="mt-2 rounded-md border border-destructive/40 px-4 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            重試
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && surveys.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#126b8a]/10">
            <svg className="h-7 w-7 text-[#126b8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-muted-foreground mb-4">還沒有任何問卷</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/surveys/new"
              className="rounded-md bg-[#126b8a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f5d78]"
            >
              建立第一份問卷
            </Link>
            <Link
              href="/dashboard/surveys/import"
              className="rounded-md border border-[#126b8a]/40 px-4 py-2 text-sm font-semibold text-[#126b8a] hover:bg-[#126b8a]/5"
            >
              或匯入現有問卷
            </Link>
          </div>
        </div>
      )}

      {/* Search + status filter */}
      {!isLoading && surveys.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋問卷標題…"
            aria-label="搜尋問卷標題"
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="篩選問卷狀態"
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="all">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="published">已發布</option>
            <option value="closed">已關閉</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="排序方式"
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="newest">最新建立</option>
            <option value="reward">獎勵高 → 低</option>
            <option value="responses">回收多 → 少</option>
          </select>
          {(query || statusFilter !== 'all') && (
            <span className="text-xs text-muted-foreground">顯示 {filteredSurveys.length} / {surveys.length} 份</span>
          )}
        </div>
      )}

      {/* No match */}
      {!isLoading && surveys.length > 0 && filteredSurveys.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          找不到符合「{query}」的問卷。
        </p>
      )}

      {/* Survey list */}
      <div className="space-y-3">
        {filteredSurveys.slice(0, surveyLimit).map((survey) => {
          const completion = survey.targetCount > 0
            ? Math.round(((survey.completedCount ?? 0) / survey.targetCount) * 100)
            : 0;
          return (
            <div
              key={survey.id}
              className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-[#126b8a]/40"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BG[survey.status] ?? ''}`}>
                      {STATUS_LABELS[survey.status] ?? survey.status}
                    </span>
                    {survey.category && (
                      <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs">
                        {SURVEY_CATEGORY_LABELS[survey.category]}
                      </span>
                    )}
                    {survey.type === 'mutual' ? (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                        🤝 互惠
                      </span>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {survey.completedCount}/{survey.targetCount} 份
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs font-medium text-[#126b8a]">
                          {survey.rewardMode === 'lottery' ? `🎁 抽 ${survey.lotteryPrize ?? '獎品'}` : `NT$${survey.rewardPoints}`}
                        </span>
                      </>
                    )}
                    {survey.deadlineTier && survey.deadlineTier !== 'standard' && (
                      <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                        ⚡ 加急
                      </span>
                    )}
                    {survey.scheduledPublishAt && (
                      <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-medium">
                        🕒 {new Date(survey.scheduledPublishAt).toLocaleDateString('zh-TW')} 發布
                      </span>
                    )}
                  </div>
                  <p className="font-medium truncate">{survey.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    建立於 {new Date(survey.createdAt).toLocaleDateString('zh-TW')}
                    {survey.updatedAt && new Date(survey.updatedAt).getTime() - new Date(survey.createdAt).getTime() > 60000 && (
                      <span> · 更新於 {relativeTime(survey.updatedAt)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={
                      survey.status === 'published' || survey.status === 'closed'
                        ? `/dashboard/surveys/${survey.id}/stats`
                        : `/dashboard/surveys/${survey.id}`
                    }
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    {survey.status === 'draft' || survey.status === 'rejected' ? '編輯' : '查看分析'}
                  </Link>
                  {survey.status === 'published' && (
                    <Link
                      href={`/dashboard/surveys/${survey.id}?edit=1`}
                      className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                      title="編輯標題、說明、圖片、樣式、感謝頁與受眾條件（題目與獎勵已鎖定）"
                    >
                      編輯
                    </Link>
                  )}
                  <button
                    onClick={() => duplicateSurvey.mutate(survey.id)}
                    disabled={duplicateSurvey.isPending}
                    className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60"
                    title="複製為新草稿"
                  >
                    {duplicateSurvey.isPending ? '複製中…' : '複製'}
                  </button>
                  {(survey.status === 'published' || survey.status === 'closed') && (
                    <button
                      onClick={() => copyShareLink(survey.id)}
                      className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                      title="複製公開填答連結"
                    >
                      {copiedId === survey.id ? '已複製!' : '複製連結'}
                    </button>
                  )}
                  {(survey.status === 'draft' || survey.status === 'rejected') && (
                    <button
                      onClick={() => {
                        if (confirm('確定刪除？')) deleteSurvey.mutate(survey.id);
                      }}
                      className="text-xs text-destructive hover:underline"
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
              {/* Progress bar for published surveys */}
              {survey.status === 'published' && survey.targetCount > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-[#126b8a] transition-all"
                    style={{ width: `${Math.min(completion, 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {surveyLimit < filteredSurveys.length && (
          <button
            type="button"
            onClick={() => setSurveyLimit((n) => n + PAGE_SIZE)}
            className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            載入更多（還有 {filteredSurveys.length - surveyLimit} 份）
          </button>
        )}
      </div>
    </main>
  );
}

// ─── AI Assistant Card ──────────────────────────────────────────────────────

function AssistantCard() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useSurveyorAssistant(enabled);

  return (
    <section className="mb-8 relative overflow-hidden rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.04] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#126b8a] to-[#8B5CF6] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">AI 助手</h2>
            <p className="text-[11px] text-slate-500">根據你的問卷狀況，建議下一步該做什麼</p>
          </div>
        </div>
        <button
          onClick={() => (enabled ? refetch() : setEnabled(true))}
          disabled={isLoading || isFetching}
          className="rounded-md bg-[#126b8a] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isLoading || isFetching ? '分析中…' : enabled ? '重新生成' : '取得建議'}
        </button>
      </div>

      {!enabled && !data && (
        <p className="relative text-sm text-slate-600">
          點擊「取得建議」由 AI 分析你的問卷組合並給出優先處理建議
        </p>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
        </div>
      )}

      {error && (
        <p className="relative text-sm text-red-600">AI 服務暫時無法使用</p>
      )}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-4">
          {/* Primary action card */}
          <div className="rounded-lg bg-white p-4 shadow-sm border border-[#126b8a]/15">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#126b8a] mb-1">
              🎯 建議下一步
            </p>
            <p className="text-base font-bold text-slate-900">{data.primaryAction.label}</p>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">{data.primaryAction.reason}</p>
            {data.primaryAction.surveyId && data.primaryAction.surveyTitle && (
              <Link
                href={`/dashboard/surveys/${data.primaryAction.surveyId}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#126b8a] hover:underline"
              >
                前往「{data.primaryAction.surveyTitle}」 →
              </Link>
            )}
          </div>

          {/* Insights + Alerts */}
          <div className="grid gap-3 md:grid-cols-2">
            {data.insights.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  📊 洞察
                </p>
                <ul className="space-y-1">
                  {data.insights.map((it, i) => (
                    <li key={i} className="border-l-2 border-[#126b8a] bg-[#126b8a]/[0.05] pl-2 py-1 text-xs text-slate-700 rounded-r">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.alerts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  ⚠️ 提醒
                </p>
                <ul className="space-y-1">
                  {data.alerts.map((a, i) => (
                    <li
                      key={i}
                      className={`border-l-2 pl-2 py-1 text-xs text-slate-700 rounded-r ${
                        a.severity === 'warning'
                          ? 'border-amber-400 bg-amber-50/60'
                          : 'border-blue-400 bg-blue-50/60'
                      }`}
                    >
                      {a.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400 text-right">
            生成於 {new Date(data.generatedAt).toLocaleString('zh-TW')}
          </p>
        </div>
      )}
    </section>
  );
}

function Kpi({
  label, value, suffix, extra, accent = 'default',
}: {
  label: string;
  value: number;
  suffix?: string;
  extra?: string;
  accent?: 'default' | 'green' | 'yellow' | 'blue';
}) {
  const accentClass = {
    default: 'text-foreground',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    blue: 'text-[#126b8a]',
  }[accent];
  // GSAP 數字 count-up（尊重 prefers-reduced-motion）
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const obj = { v: 0 };
    const tw = gsap.to(obj, {
      v: value,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => setDisplay(Math.round(obj.v)),
    });
    return () => {
      tw.kill();
    };
  }, [value]);
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accentClass}`}>
        {display}
        {suffix && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
      {extra && <p className="mt-0.5 text-xs text-muted-foreground">{extra}</p>}
    </div>
  );
}
