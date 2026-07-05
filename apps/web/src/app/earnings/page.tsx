'use client';

import Link from 'next/link';
import { useEarningsSummary, usePointsSummary } from '@/hooks/use-wallet';
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
  const { data: pointsSummary } = usePointsSummary();

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

      {/* 積分總覽 */}
      {pointsSummary && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🪙</span>
            <span className="text-sm font-semibold text-amber-800">平台積分</span>
            <span className="ml-auto text-xs text-amber-600">1 積分 ≈ NT$0.5</span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-amber-900">
            {pointsSummary.balance.toLocaleString()}
            <span className="ml-1 text-sm text-amber-600">積分</span>
          </p>
          <p className="mt-1 text-xs text-amber-700">
            ≈ NT${pointsSummary.estimatedValue.toLocaleString()} 等值 · 本月獲得 {pointsSummary.thisMonth.toLocaleString()} 積分
          </p>
          <div className="mt-4">
            <Link href="/shop" className="text-sm font-semibold text-amber-700 underline hover:text-amber-900">
              前往積分商城兌換 →
            </Link>
          </div>
        </div>
      )}

      {/* 現金收益（保留顯示但標記即將上線） */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💵</span>
          <span className="text-sm font-semibold text-blue-800">現金收益</span>
          <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">即將上線</span>
        </div>
        <p className="text-xs text-blue-700">
          現金提領功能正在進行法規與稅務處理，完成後即可將收益提領至銀行帳戶。
          目前收益將以積分形式累積，可至商城兌換超商禮券或其他商品。
        </p>
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
