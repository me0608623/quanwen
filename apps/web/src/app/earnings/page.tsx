'use client';

import Link from 'next/link';
import { useEarningsSummary } from '@/hooks/use-wallet';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ─── 月收益長條圖（純 CSS）────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: { month: string; amount: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const reversed = [...data].reverse(); // 由舊到新

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        近半年月收益
      </h3>
      <div className="flex items-end gap-3 h-28">
        {reversed.map((d) => {
          const pct = Math.round((d.amount / max) * 100);
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground tabular-nums">
                NT${d.amount.toLocaleString()}
              </span>
              <div
                className="w-full rounded-t bg-primary/70 hover:bg-primary transition-all"
                style={{ height: `${Math.max(pct, d.amount > 0 ? 6 : 0)}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{d.month.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EarningsPage() {
  const { data: summary, isLoading, isError, refetch } = useEarningsSummary();

  if (isLoading) {
    return <main className="mx-auto max-w-xl px-4 py-10"><LoadingSpinner /></main>;
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-destructive">載入失敗。</p>
        <button onClick={() => refetch()} className="mt-2 rounded-md border border-destructive/40 px-4 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">重試</button>
      </main>
    );
  }

  if (!summary) return null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">我的收益</h1>

      {/* 總覽卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">累計獲得</p>
          <p className="text-xl font-bold tabular-nums">NT${summary.totalEarned.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">本月收益</p>
          <p className="text-xl font-bold tabular-nums text-primary">NT${summary.thisMonth.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">待入帳</p>
          <p className="text-xl font-bold tabular-nums text-yellow-700">NT${summary.pendingRewards.toLocaleString()}</p>
        </div>
      </div>

      {/* 月收益圖 */}
      {summary.monthly.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <MonthlyChart data={summary.monthly} />
        </div>
      )}

      {/* 各問卷收益 */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          收益來源（問卷）
        </h2>

        {summary.bySurvey.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">尚無收益紀錄</p>
          </div>
        )}

        <div className="space-y-2">
          {summary.bySurvey.map((s) => (
            <div
              key={s.surveyId}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <p className="text-sm truncate max-w-[70%]">{s.surveyTitle}</p>
              <p className="text-sm font-semibold text-green-600 tabular-nums shrink-0">
                +NT${s.amount.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 前往錢包 */}
      <div className="text-center">
        <Link href="/wallet" className="text-sm text-primary hover:underline">
          查看錢包餘額 / 申請提領 →
        </Link>
      </div>
    </main>
  );
}
