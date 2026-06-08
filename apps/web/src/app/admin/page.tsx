'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePlatformStats, usePlatformHealth } from '@/hooks/use-admin';
import { SurveyStatusDonut } from '@/components/admin/survey-status-donut';

// 後台統一用品牌 teal #126b8a 作單一強調色，中性色走 shadcn tokens（Color Consistency Lock）

// 進場動效（MOTION_INTENSITY 3）：whileInView 淡入，尊重 prefers-reduced-motion
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

function ChevronGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// 數據 tile（VISUAL_DENSITY 6：緊湊、tabular-nums、無多餘陰影）
function StatTile({ label, value, sub, emphasis }: { label: string; value: number | string; sub?: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? 'text-[#126b8a]' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// 待處理佇列 tile：有數字者顯示數字 + 待處理/已清空；無數字者顯示「前往審核」
function QueueTile({ href, label, count }: { href: string; label: string; count?: number }) {
  const hasCount = typeof count === 'number';
  const active = hasCount && count! > 0;
  return (
    <a
      href={href}
      className={`group flex flex-col justify-between rounded-xl border p-4 transition hover:-translate-y-0.5 ${
        active ? 'border-[#126b8a]/30 bg-[#126b8a]/[0.05]' : 'border-border bg-card hover:border-[#126b8a]/30'
      }`}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hasCount ? (
        <span className="mt-3 flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${active ? 'text-[#126b8a]' : 'text-muted-foreground'}`}>{count}</span>
          <span className="text-xs text-muted-foreground">{active ? '待處理' : '已清空'}</span>
        </span>
      ) : (
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#126b8a]">
          前往審核 <ChevronGlyph />
        </span>
      )}
    </a>
  );
}

function ToolLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-[#126b8a]/30"
    >
      {label}
      <span className="text-muted-foreground transition-colors group-hover:text-[#126b8a]"><ChevronGlyph /></span>
    </a>
  );
}

// 待處理佇列（行動入口）；其餘工具見頁尾
const QUEUE = [
  { href: '/admin/surveys', label: '問卷審核', key: 'pending_review' as const },
  { href: '/admin/responses', label: '可疑填答', key: 'suspicious' as const },
  { href: '/admin/withdrawals', label: '提領審核' },
  { href: '/admin/kyc', label: 'KYC 審核' },
  { href: '/admin/appeals', label: '申訴管理' },
  { href: '/admin/lottery', label: '抽獎履約' },
];

// 工具型入口（導航，非行動佇列）
const TOOLS = [
  { href: '/admin/users', label: '使用者管理' },
  { href: '/admin/transactions', label: '交易稽核' },
  { href: '/admin/reconciliation', label: '對帳' },
  { href: '/admin/ai-usage', label: 'AI 成本' },
  { href: '/admin/mutual', label: '互惠配對' },
  { href: '/admin/import-appeals', label: '匯入申訴' },
];

export default function AdminOverviewPage() {
  const { data: stats, isLoading, isError } = usePlatformStats();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </main>
    );
  }

  // stats 載入失敗也要 render 入口，讓 admin 至少能切到其他頁
  if (!stats) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">平台總覽</h1>
        {isError && <p className="text-sm text-destructive">統計資料載入失敗。可以先用下方入口繼續操作。</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUEUE.map((q) => <QueueTile key={q.href} href={q.href} label={q.label} />)}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {TOOLS.map((t) => <ToolLink key={t.href} href={t.href} label={t.label} />)}
        </div>
      </main>
    );
  }

  const queueCount = (key?: string) =>
    key === 'pending_review' ? stats.surveyCounts.pending_review
    : key === 'suspicious' ? stats.suspiciousResponses
    : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Header：標題 + 收入 KPI 直接上提到頂部 */}
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">平台總覽</h1>
          <p className="mt-1 text-sm text-muted-foreground">券問營運駕駛艙</p>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-muted-foreground">本月收入</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-[#126b8a]">NT${(stats.platformRevenueThisMonth ?? 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">累計收入</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">NT${(stats.platformRevenue ?? 0).toLocaleString()}</p>
          </div>
        </div>
      </header>

      <div className="mt-8 space-y-10">
        {/* 待處理事項：營運第一要務，置頂 */}
        <Reveal>
          <h2 className="mb-3 text-sm font-semibold text-foreground">待處理事項</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {QUEUE.map((q) => <QueueTile key={q.href} href={q.href} label={q.label} count={queueCount(q.key)} />)}
          </div>
        </Reveal>

        {/* AI 平台健康摘要 */}
        <Reveal delay={0.05}>
          <PlatformHealthPanel />
        </Reveal>

        {/* 用戶 */}
        <Reveal delay={0.05}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">用戶</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="總用戶數" value={stats.totalUsers} />
            <StatTile label="問券方" value={stats.totalSurveyors} />
            <StatTile label="受試者" value={stats.totalRespondents} />
          </div>
        </Reveal>

        {/* 問卷 + 狀態分佈 */}
        <Reveal delay={0.05}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">問卷</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
              <StatTile label="待審核" value={stats.surveyCounts.pending_review} emphasis={stats.surveyCounts.pending_review > 0}
                sub={stats.surveyCounts.pending_review > 0 ? '需要處理' : '已清空'} />
              <StatTile label="已發布" value={stats.surveyCounts.published} />
              <StatTile label="已關閉" value={stats.surveyCounts.closed} />
              <StatTile label="已拒絕" value={stats.surveyCounts.rejected} />
              <StatTile label="草稿" value={stats.surveyCounts.draft} />
              <StatTile label="暫停中" value={stats.surveyCounts.paused} />
            </div>
            <SurveyStatusDonut counts={stats.surveyCounts} />
          </div>
        </Reveal>

        {/* 填答 */}
        <Reveal delay={0.05}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">填答</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="總填答數" value={stats.totalResponses} />
            <StatTile label="可疑填答" value={stats.suspiciousResponses} emphasis={stats.suspiciousResponses > 0}
              sub={stats.suspiciousResponses > 0 ? '需要審查' : '無可疑'} />
          </div>
        </Reveal>

        {/* 互惠配對 */}
        <Reveal delay={0.05}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">互惠配對</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="池中等待" value={stats.mutualCounts?.waiting ?? 0}
              sub={(stats.mutualCounts?.waiting ?? 0) > 0 ? '配對中' : '無'} />
            <StatTile label="配對中" value={(stats.mutualCounts?.matched ?? 0) + (stats.mutualCounts?.a_done ?? 0) + (stats.mutualCounts?.b_done ?? 0)} sub="進行中" />
            <StatTile label="已解鎖" value={stats.mutualCounts?.both_done ?? 0} sub="雙方都完成" />
            <StatTile label="超時" value={stats.mutualCounts?.expired ?? 0} sub="72hr 內未完成" />
            <StatTile label="取消" value={stats.mutualCounts?.cancelled ?? 0} sub="AI 退件" />
          </div>
        </Reveal>

        {/* 其他管理工具 */}
        <Reveal delay={0.05}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">其他管理</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {TOOLS.map((t) => <ToolLink key={t.href} href={t.href} label={t.label} />)}
          </div>
        </Reveal>
      </div>
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
    <section className="relative overflow-hidden rounded-xl border border-[#126b8a]/25 bg-[#126b8a]/[0.04] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#126b8a] text-white">
            <SparkleIcon />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">AI 平台健康摘要</h2>
            <p className="text-[11px] text-muted-foreground">基於即時 stats 由 LLM 解讀</p>
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
        <p className="relative text-sm text-muted-foreground">
          點擊「生成摘要」由 AI 解讀目前數據並給出行動建議
        </p>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-[#126b8a]/15" style={{ width: `${100 - i * 8}%` }} />
          ))}
          <p className="mt-1 text-xs text-muted-foreground">LLM 分析中…</p>
        </div>
      )}

      {error && (
        <p className="relative text-sm text-destructive">產生摘要失敗，請稍後再試</p>
      )}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            <p className="text-sm font-semibold text-foreground">{data.headline}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.highlights.length > 0 && (
              <HealthCol label="正面指標" items={data.highlights} accent="green" />
            )}
            {data.concerns.length > 0 && (
              <HealthCol label="需注意項" items={data.concerns} accent="amber" />
            )}
            {data.suggestedActions.length > 0 && (
              <HealthCol label="建議行動" items={data.suggestedActions} accent="blue" />
            )}
          </div>

          <p className="text-right text-[10px] text-muted-foreground">
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

function HealthCol({ label, items, accent }: {
  label: string;
  items: string[];
  accent: 'green' | 'amber' | 'blue';
}) {
  const cls = {
    green: 'border-l-green-400 bg-green-50/50',
    amber: 'border-l-amber-400 bg-amber-50/50',
    blue: 'border-l-[#126b8a] bg-[#126b8a]/[0.06]',
  }[accent];
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`rounded-r border-l-2 ${cls} py-1 pl-2 text-xs text-foreground`}>
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
