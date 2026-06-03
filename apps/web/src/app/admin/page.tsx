'use client';

import { useState } from 'react';
import { usePlatformStats, usePlatformHealth } from '@/hooks/use-admin';
import { SurveyStatusDonut } from '@/components/admin/survey-status-donut';

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const { data: stats, isLoading, isError } = usePlatformStats();

  if (isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-muted-foreground text-sm">載入中…</p></main>;
  }

  // 即使 stats 載入失敗，也要 render 快捷入口讓 admin 至少能切到其他頁
  if (!stats) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold">平台總覽</h1>
        {isError && <p className="text-sm text-destructive">統計資料載入失敗。可以先用下方快捷入口繼續操作。</p>}
        <section className="flex flex-wrap gap-3">
          <a href="/admin/surveys" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">問卷審核</a>
          <a href="/admin/responses" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">可疑填答</a>
          <a href="/admin/withdrawals" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">提領審核</a>
          <a href="/admin/appeals" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">申訴管理</a>
          <a href="/admin/kyc" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">KYC 審核</a>
          <a href="/admin/lottery" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">抽獎履約</a>
        </section>
      </main>
    );
  }

  const totalSurveys = Object.values(stats.surveyCounts).reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <h1 className="text-2xl font-bold">平台總覽</h1>

      {/* AI 平台健康摘要 */}
      <PlatformHealthPanel />

      {/* 用戶統計 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">用戶</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="總用戶數" value={stats.totalUsers} />
          <StatCard label="問券方" value={stats.totalSurveyors} />
          <StatCard label="受試者" value={stats.totalRespondents} />
        </div>
      </section>

      {/* 問卷統計 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">問卷</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="待審核" value={stats.surveyCounts.pending_review}
              sub={stats.surveyCounts.pending_review > 0 ? '需要處理' : '已清空'} />
            <StatCard label="已發布" value={stats.surveyCounts.published} />
            <StatCard label="已關閉" value={stats.surveyCounts.closed} />
            <StatCard label="已拒絕" value={stats.surveyCounts.rejected} />
            <StatCard label="草稿" value={stats.surveyCounts.draft} />
            <StatCard label="暫停中" value={stats.surveyCounts.paused} />
          </div>
          <SurveyStatusDonut counts={stats.surveyCounts} />
        </div>
      </section>

      {/* 填答統計 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">填答</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="總填答數" value={stats.totalResponses} />
          <StatCard
            label="可疑填答"
            value={stats.suspiciousResponses}
            sub={stats.suspiciousResponses > 0 ? '需要審查' : '無可疑'}
          />
        </div>
      </section>

      {/* 互惠配對統計 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">互惠配對</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="池中等待" value={stats.mutualCounts?.waiting ?? 0}
            sub={(stats.mutualCounts?.waiting ?? 0) > 0 ? '配對中' : '無'} />
          <StatCard label="配對中" value={(stats.mutualCounts?.matched ?? 0) + (stats.mutualCounts?.a_done ?? 0) + (stats.mutualCounts?.b_done ?? 0)} sub="進行中" />
          <StatCard label="已解鎖" value={stats.mutualCounts?.both_done ?? 0} sub="雙方都完成" />
          <StatCard label="超時" value={stats.mutualCounts?.expired ?? 0} sub="72hr 內未完成" />
          <StatCard label="取消" value={stats.mutualCounts?.cancelled ?? 0} sub="AI 退件" />
        </div>
      </section>

      {/* 收入統計 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">平台收入（手續費）</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="本月收入" value={`NT$${(stats.platformRevenueThisMonth ?? 0).toLocaleString()}`} />
          <StatCard label="累計收入" value={`NT$${(stats.platformRevenue ?? 0).toLocaleString()}`} />
        </div>
      </section>

      {/* 快捷動作 */}
      <section className="flex flex-wrap gap-3">
        <a
          href="/admin/surveys"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          問卷審核 {stats.surveyCounts.pending_review > 0 && `(${stats.surveyCounts.pending_review})`}
        </a>
        <a
          href="/admin/responses"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          可疑填答 {stats.suspiciousResponses > 0 && `(${stats.suspiciousResponses})`}
        </a>
        <a
          href="/admin/withdrawals"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          提領審核
        </a>
        <a
          href="/admin/appeals"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          申訴管理
        </a>
        <a
          href="/admin/kyc"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          KYC 審核
        </a>
        <a
          href="/admin/lottery"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          抽獎履約
        </a>
      </section>
    </main>
  );
}

// ─── AI Platform Health Panel ───────────────────────────────────────────────

function PlatformHealthPanel() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = usePlatformHealth(enabled);

  const handleClick = () => {
    if (!enabled) {
      setEnabled(true);
    } else {
      refetch();
    }
  };

  return (
    <section className="relative overflow-hidden rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.04] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#126b8a] to-[#8B5CF6] text-white">
            <SparkleIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">AI 平台健康摘要</h2>
            <p className="text-[11px] text-slate-500">基於即時 stats 由 LLM 解讀</p>
          </div>
        </div>
        <button
          onClick={handleClick}
          disabled={isLoading || isFetching}
          className="rounded-md bg-[#126b8a] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isLoading || isFetching ? '分析中…' : enabled ? '重新生成' : '生成摘要'}
        </button>
      </div>

      {!enabled && !data && (
        <p className="relative text-sm text-slate-600">
          點擊「生成摘要」由 AI 解讀目前數據並給出行動建議
        </p>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
          <p className="text-xs text-slate-500 mt-1">⏳ LLM 分析中…</p>
        </div>
      )}

      {error && (
        <p className="relative text-sm text-red-600">產生摘要失敗，請稍後再試</p>
      )}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={data.status} />
            <p className="text-sm font-semibold text-slate-800">{data.headline}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.highlights.length > 0 && (
              <HealthCol label="正面指標" icon="✅" items={data.highlights} accent="green" />
            )}
            {data.concerns.length > 0 && (
              <HealthCol label="需注意項" icon="⚠️" items={data.concerns} accent="amber" />
            )}
            {data.suggestedActions.length > 0 && (
              <HealthCol label="建議行動" icon="🎯" items={data.suggestedActions} accent="blue" />
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

function StatusBadge({ status }: { status: 'healthy' | 'attention' | 'critical' }) {
  const cfg = {
    healthy: { label: '健康', cls: 'bg-green-100 text-green-700' },
    attention: { label: '需注意', cls: 'bg-amber-100 text-amber-700' },
    critical: { label: '需處理', cls: 'bg-red-100 text-red-700' },
  }[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function HealthCol({ label, icon, items, accent }: {
  label: string;
  icon: string;
  items: string[];
  accent: 'green' | 'amber' | 'blue';
}) {
  const cls = {
    green: 'border-l-green-400 bg-green-50/50',
    amber: 'border-l-amber-400 bg-amber-50/50',
    blue: 'border-l-[#126b8a] bg-[#126b8a]/[0.05]',
  }[accent];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
        {icon} {label}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`border-l-2 ${cls} pl-2 py-1 text-xs text-slate-700 rounded-r`}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
    </svg>
  );
}
