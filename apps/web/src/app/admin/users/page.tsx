'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminUserRow,
  AdminUserStatus,
  useAdminUsers,
  useSuspendUser,
  useUnsuspendUser,
} from '@/hooks/use-admin-users';
import { extractApiError } from '@/lib/extract-error';

const STATUS_TABS: Array<{ value: AdminUserStatus | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_verify', label: 'Pending Verify' },
];

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  suspended: '已停權',
  pending_verify: '待驗證',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  pending_verify: 'bg-yellow-100 text-yellow-800',
};

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
}

function SuspendDialog({
  user,
  onConfirm,
  onCancel,
  isPending,
  error,
}: {
  user: AdminUserRow;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const valid = trimmed.length >= 5 && trimmed.length <= 500;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-1">停權使用者</h3>
        <p className="text-sm text-muted-foreground mb-4 truncate">
          {user.displayName || '未命名使用者'} · {user.email}
        </p>
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          停權後該用戶將立即無法登入
        </div>
        <label className="block text-sm font-medium mb-1">停權原因（5-500 字）</label>
        <textarea
          className="h-28 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="請輸入停權原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className={`mt-1 text-xs ${valid || trimmed.length === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
          {trimmed.length}/500
        </p>
        {error ? <p className="mt-2 text-sm text-destructive">{extractApiError(error, '停權失敗')}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            取消
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={!valid || isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            確認停權
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<AdminUserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<AdminUserRow | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);

  const users = useAdminUsers({
    q: debouncedSearch || undefined,
    status: status || undefined,
    page,
    limit: 20,
  });
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();

  const data = users.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleSuspend = (reason: string) => {
    if (!suspendTarget) return;
    suspend.mutate(
      { id: suspendTarget.id, reason },
      { onSuccess: () => setSuspendTarget(null) },
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {suspendTarget && (
        <SuspendDialog
          user={suspendTarget}
          onConfirm={handleSuspend}
          onCancel={() => setSuspendTarget(null)}
          isPending={suspend.isPending}
          error={suspend.error}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">使用者管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">搜尋、停權與檢視平台使用者狀態</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm md:w-80"
          placeholder="搜尋 email 或名稱"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              status === tab.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {users.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(users.error, '使用者資料載入失敗')}
        </div>
      )}
      {unsuspend.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(unsuspend.error, '復權失敗')}
        </div>
      )}

      {users.isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!users.isLoading && data?.items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有符合條件的使用者</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">使用者</th>
                <th className="px-4 py-3 font-medium">Role / Tier / Status</th>
                <th className="px-4 py-3 font-medium">現金餘額</th>
                <th className="px-4 py-3 font-medium">積分</th>
                <th className="px-4 py-3 font-medium">問卷</th>
                <th className="px-4 py-3 font-medium">填答</th>
                <th className="px-4 py-3 font-medium">註冊日</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.displayName || '未命名使用者'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{user.role}</Badge>
                      <Badge>{user.tier}</Badge>
                      <StatusBadge status={user.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(user.cashBalance)}</td>
                  <td className="px-4 py-3 tabular-nums">{user.pointsBalance.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{user.surveyCount}</td>
                  <td className="px-4 py-3 tabular-nums">{user.responseCount}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {user.status === 'suspended' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            unsuspend.mutate(user.id);
                          }}
                          disabled={unsuspend.isPending}
                          className="rounded-md border border-green-600 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          復權
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSuspendTarget(user);
                          }}
                          className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          停權
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={data.total}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      )}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <p className="text-muted-foreground">共 {total.toLocaleString()} 筆</p>
      <div className="flex items-center gap-3">
        <button onClick={onPrev} disabled={page <= 1} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-muted">
          上一頁
        </button>
        <span className="text-muted-foreground">{page} / {totalPages}</span>
        <button onClick={onNext} disabled={page >= totalPages} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-muted">
          下一頁
        </button>
      </div>
    </div>
  );
}
