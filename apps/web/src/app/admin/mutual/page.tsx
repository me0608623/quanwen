'use client';

import { useState } from 'react';
import { useAdminMutualPairs, useForceCancelMutualPair, useAdminMatchMutualNow, type AdminMutualPair } from '@/hooks/use-admin';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '',          label: '全部' },
  { value: 'waiting',   label: '配對中' },
  { value: 'matched',   label: '進行中' },
  { value: 'a_done',    label: 'A 完成' },
  { value: 'b_done',    label: 'B 完成' },
  { value: 'both_done', label: '已解鎖' },
  { value: 'cancelled', label: 'AI 退件' },
  { value: 'expired',   label: '超時' },
];

const STATUS_TONE: Record<AdminMutualPair['status'], string> = {
  waiting:   'bg-amber-100 text-amber-800',
  matched:   'bg-blue-100 text-blue-800',
  a_done:    'bg-blue-100 text-blue-800',
  b_done:    'bg-blue-100 text-blue-800',
  both_done: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
  expired:   'bg-slate-100 text-slate-600',
};

export default function AdminMutualPage() {
  const [status, setStatus] = useState<string>('');
  const { data, isLoading } = useAdminMutualPairs(status || undefined);
  const cancel = useForceCancelMutualPair();
  const matchNow = useAdminMatchMutualNow();

  const handleCancel = async (pair: AdminMutualPair) => {
    const reason = window.prompt(`取消這個配對的理由？\n\n${pair.a.displayName} ↔ ${pair.b?.displayName ?? '(無對手)'}`, '管理員介入');
    if (!reason || reason.trim().length === 0) return;
    try {
      await cancel.mutateAsync({ id: pair.id, reason: reason.trim() });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '取消失敗');
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">互惠配對管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            所有 mutual_pairs。可手動取消可疑配對；正常狀況下配對由 cron 自動管理。
          </p>
        </div>
        <button
          onClick={() => matchNow.mutate()}
          disabled={matchNow.isPending}
          className="shrink-0 rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-60"
        >
          {matchNow.isPending ? '配對中...' : '立即配對'}
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setStatus(f.value)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              status === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          目前沒有符合條件的配對。
        </div>
      )}

      <div className="space-y-3">
        {(data ?? []).map((pair) => {
          const canCancel = ['waiting', 'matched', 'a_done', 'b_done'].includes(pair.status);
          return (
            <div key={pair.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[pair.status]}`}>
                    {pair.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    建立 {new Date(pair.createdAt).toLocaleString('zh-TW')}
                  </span>
                  {pair.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      | 到期 {new Date(pair.expiresAt).toLocaleString('zh-TW')}
                    </span>
                  )}
                </div>
                {canCancel && (
                  <button
                    onClick={() => handleCancel(pair)}
                    disabled={cancel.isPending}
                    className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    強制取消
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SideCard label="A" side={pair.a} />
                {pair.b ? (
                  <SideCard label="B" side={{ ...pair.b, surveyTitle: pair.b.surveyTitle ?? '(無問卷)' }} />
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-border p-3 text-xs text-muted-foreground">
                    尚未配對到對手
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function SideCard({ label, side }: {
  label: string;
  side: { displayName: string; email: string; surveyTitle: string; category?: string | null; filledAt: string | null };
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{label}</span>
        <span className="text-xs text-muted-foreground truncate">{side.email}</span>
      </div>
      <p className="text-sm font-semibold truncate">{side.displayName}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-muted-foreground truncate flex-1">{side.surveyTitle}</p>
        {side.category && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
            {side.category}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px]">
        {side.filledAt ? (
          <span className="text-emerald-700">✓ 已填 {new Date(side.filledAt).toLocaleString('zh-TW')}</span>
        ) : (
          <span className="text-muted-foreground">未填</span>
        )}
      </p>
    </div>
  );
}
