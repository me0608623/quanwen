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
import {
  AdminPageHeader,
  Pill,
  PrimaryButton,
  DangerButton,
  TableSkeleton,
  EmptyState,
  ErrorBanner,
  Pagination,
  ReasonDialog,
} from '@/components/admin/ui';

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

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'neutral'> = {
  active: 'green',
  suspended: 'red',
  pending_verify: 'amber',
};

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
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
    <main className="mx-auto max-w-6xl px-4 py-8">
      {suspendTarget && (
        <ReasonDialog
          title="停權使用者"
          subtitle={`${suspendTarget.displayName || '未命名使用者'} · ${suspendTarget.email}`}
          warning="停權後該用戶將立即無法登入"
          label="停權原因（5-500 字）"
          placeholder="請輸入停權原因"
          minLen={5}
          maxLen={500}
          confirmLabel="確認停權"
          onConfirm={handleSuspend}
          onCancel={() => setSuspendTarget(null)}
          isPending={suspend.isPending}
          error={suspend.error ? extractApiError(suspend.error, '停權失敗') : null}
        />
      )}

      <AdminPageHeader
        title="使用者管理"
        subtitle="搜尋、停權與檢視平台使用者狀態"
        right={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#126b8a] sm:w-72"
            placeholder="搜尋 email 或名稱"
          />
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              status === tab.value
                ? 'border-[#126b8a] bg-[#126b8a] text-white'
                : 'border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {users.error && <ErrorBanner>{extractApiError(users.error, '使用者資料載入失敗')}</ErrorBanner>}
      {unsuspend.error && <ErrorBanner>{extractApiError(unsuspend.error, '復權失敗')}</ErrorBanner>}

      {users.isLoading && <TableSkeleton rows={6} />}

      {!users.isLoading && data?.items.length === 0 && <EmptyState>目前沒有符合條件的使用者</EmptyState>}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">使用者</th>
                <th className="px-4 py-3 font-medium">Role / Tier / Status</th>
                <th className="px-4 py-3 text-right font-medium">現金餘額</th>
                <th className="px-4 py-3 text-right font-medium">積分</th>
                <th className="px-4 py-3 text-right font-medium">問卷</th>
                <th className="px-4 py-3 text-right font-medium">填答</th>
                <th className="px-4 py-3 font-medium">註冊日</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                  className="cursor-pointer border-b border-border transition last:border-0 hover:bg-[#126b8a]/[0.04]"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.displayName || '未命名使用者'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Pill>{user.role}</Pill>
                      <Pill>{user.tier}</Pill>
                      <Pill tone={STATUS_TONE[user.status] ?? 'neutral'}>
                        {STATUS_LABELS[user.status] ?? user.status}
                      </Pill>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(user.cashBalance)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{user.pointsBalance.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{user.surveyCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{user.responseCount}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {new Date(user.createdAt).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    {user.status === 'suspended' ? (
                      <PrimaryButton
                        onClick={(e) => {
                          e.stopPropagation();
                          unsuspend.mutate(user.id);
                        }}
                        disabled={unsuspend.isPending}
                      >
                        復權
                      </PrimaryButton>
                    ) : (
                      <DangerButton
                        onClick={(e) => {
                          e.stopPropagation();
                          setSuspendTarget(user);
                        }}
                      >
                        停權
                      </DangerButton>
                    )}
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
