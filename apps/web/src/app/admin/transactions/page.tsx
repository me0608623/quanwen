'use client';

import { useState } from 'react';
import {
  AdminTransactionStatus,
  AdminTransactionType,
  useAdminTransactions,
} from '@/hooks/use-admin-audit';
import { extractApiError } from '@/lib/extract-error';

const TYPES: Array<{ value: AdminTransactionType | ''; label: string }> = [
  { value: '', label: '全部類型' },
  { value: 'deposit', label: '儲值' },
  { value: 'reward_out', label: '問卷獎勵支出' },
  { value: 'reward_in', label: '填答獎勵收入' },
  { value: 'platform_fee', label: '平台手續費' },
  { value: 'withdraw_request', label: '提領申請' },
  { value: 'withdraw_complete', label: '提領完成' },
  { value: 'refund', label: '退款' },
  { value: 'points_in', label: '積分收入' },
  { value: 'points_spend', label: '積分支出' },
];

const STATUSES: Array<{ value: AdminTransactionStatus | ''; label: string }> = [
  { value: '', label: '全部狀態' },
  { value: 'pending', label: '待處理' },
  { value: 'processing', label: '處理中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失敗' },
  { value: 'cancelled', label: '已取消' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
}

function typeLabel(type: string) {
  return TYPES.find((t) => t.value === type)?.label ?? type;
}

function statusLabel(status: string) {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

function amountClass(type: string) {
  if (type === 'reward_out' || type === 'withdraw_request' || type === 'withdraw_complete') return 'text-red-600';
  if (type === 'deposit' || type === 'reward_in') return 'text-green-700';
  return 'text-foreground';
}

export default function AdminTransactionsPage() {
  const [type, setType] = useState<AdminTransactionType | ''>('');
  const [status, setStatus] = useState<AdminTransactionStatus | ''>('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);

  const query = useAdminTransactions({
    type: type || undefined,
    status: status || undefined,
    userId: userId.trim() || undefined,
    page,
    limit: 50,
  });

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">交易稽核</h1>
        <p className="mt-1 text-sm text-muted-foreground">檢視交易明細與目前篩選條件下的類型彙總</p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as AdminTransactionType | '');
            setPage(1);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {TYPES.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AdminTransactionStatus | '');
            setPage(1);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
        </select>
        <input
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="依 userId 篩選"
        />
      </div>

      {query.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(query.error, '交易資料載入失敗')}
        </div>
      )}

      {query.isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {data && data.summaryByType.length > 0 && (
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.summaryByType.map((summary) => (
            <div key={summary.type} className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{typeLabel(summary.type)}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{summary.count.toLocaleString()} 筆</p>
              <p className="mt-1 text-sm font-medium tabular-nums">{money(summary.totalAmount)}</p>
            </div>
          ))}
        </section>
      )}

      {!query.isLoading && data?.items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有符合條件的交易</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">使用者</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium">金額</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">External Ref</th>
                <th className="px-4 py-3 font-medium">備註</th>
                <th className="px-4 py-3 font-medium">建立時間</th>
                <th className="px-4 py-3 font-medium">完成時間</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{tx.userEmail ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{tx.userDisplayName ?? tx.userId}</p>
                  </td>
                  <td className="px-4 py-3">{typeLabel(tx.type)}</td>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${amountClass(tx.type)}`}>{money(tx.amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={tx.status} /></td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-xs text-muted-foreground">{tx.externalRef ?? '—'}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-muted-foreground">{tx.note ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString('zh-TW')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{tx.completedAt ? new Date(tx.completedAt).toLocaleString('zh-TW') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">共 {data.total.toLocaleString()} 筆</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-muted">
              上一頁
            </button>
            <span className="text-muted-foreground">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-muted">
              下一頁
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {statusLabel(status)}
    </span>
  );
}
