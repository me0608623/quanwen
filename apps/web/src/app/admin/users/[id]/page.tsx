'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  useAdminUserDetail,
  useAdminWallet,
  useAdjustWallet,
  useMultiAccountScan,
  useSuspendUser,
  useUnsuspendUser,
  useUpdateUserTier,
} from '@/hooks/use-admin-users';
import type { AdminUserDetail, AdminUserTier } from '@/hooks/use-admin-users';
import { extractApiError } from '@/lib/extract-error';

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  suspended: '已停權',
  pending_verify: '待驗證',
  pending: '待處理',
  processing: '處理中',
  success: '成功',
  failed: '失敗',
  cancelled: '已取消',
  approved: '已通過',
  rejected: '已拒絕',
  submitted: '已送出',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  pending_verify: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  submitted: 'bg-blue-100 text-blue-800',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: '儲值',
  reward_out: '問卷獎勵支出',
  reward_in: '填答獎勵收入',
  platform_fee: '平台手續費',
  withdraw_request: '提領申請',
  withdraw_complete: '提領完成',
  refund: '退款',
  points_in: '積分收入',
  points_spend: '積分支出',
  admin_adjustment: '管理員調整',
};

const TIER_LABELS: Record<AdminUserTier, string> = {
  free: 'Free',
  vip: 'VIP',
  vvip: 'VVIP',
};

const TIER_OPTIONS: AdminUserTier[] = ['free', 'vip', 'vvip'];

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
}

function isAdminUserTier(value: string): value is AdminUserTier {
  return TIER_OPTIONS.includes(value as AdminUserTier);
}

export default function AdminUserDetailPage() {
  // Next 16：client component 用 useParams() 取得路由參數（params prop 已變 Promise，
  // 直接讀 params.id 會是 undefined → query 停用 → 頁面空白）。
  const { id } = useParams<{ id: string }>();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const detail = useAdminUserDetail(id);
  const walletDetail = useAdminWallet(id);
  const adjustWallet = useAdjustWallet(id);
  const scan = useMultiAccountScan(id, scanEnabled);
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();
  const updateTier = useUpdateUserTier();
  const [selectedTier, setSelectedTier] = useState<AdminUserTier>('free');

  const user = detail.data?.user;

  useEffect(() => {
    if (user?.tier && isAdminUserTier(user.tier)) {
      setSelectedTier(user.tier);
    }
  }, [user?.tier]);

  const runScan = () => {
    if (!scanEnabled) {
      setScanEnabled(true);
    } else {
      scan.refetch();
    }
  };

  const handleSuspend = (reason: string) => {
    suspend.mutate(
      { id, reason },
      { onSuccess: () => setSuspendOpen(false) },
    );
  };

  const handleUpdateTier = () => {
    if (!user || selectedTier === user.tier) return;
    updateTier.mutate({ id, tier: selectedTier });
  };

  const handleAdjust = (amount: number, reason: string) => {
    adjustWallet.mutate(
      { amount, reason },
      { onSuccess: () => setAdjustOpen(false) },
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {user && suspendOpen && (
        <SuspendDialog
          title={user.displayName || user.email}
          onConfirm={handleSuspend}
          onCancel={() => setSuspendOpen(false)}
          isPending={suspend.isPending}
          error={suspend.error}
        />
      )}
      {adjustOpen && (
        <AdjustWalletDialog
          currentBalance={walletDetail.data?.wallet?.cashBalance ?? detail.data?.wallet?.cashBalance ?? 0}
          onConfirm={handleAdjust}
          onCancel={() => setAdjustOpen(false)}
          isPending={adjustWallet.isPending}
          error={adjustWallet.error}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <a href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">返回使用者管理</a>
          <h1 className="mt-2 text-2xl font-bold">使用者詳情</h1>
        </div>
        {user && (
          <div className="flex gap-2">
            {user.status === 'suspended' ? (
              <button
                onClick={() => unsuspend.mutate(id)}
                disabled={unsuspend.isPending}
                className="rounded-md border border-green-600 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                復權
              </button>
            ) : (
              <button
                onClick={() => setSuspendOpen(true)}
                className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                停權
              </button>
            )}
          </div>
        )}
      </div>

      {detail.isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
      {detail.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(detail.error, '使用者資料載入失敗')}
        </div>
      )}
      {unsuspend.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(unsuspend.error, '復權失敗')}
        </div>
      )}
      {updateTier.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(updateTier.error, 'VIP 等級更新失敗')}
        </div>
      )}

      {detail.data && (
        <div className="space-y-6">
          <TopCards data={detail.data} />

          {user && (
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-base font-semibold">VIP 等級</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{user.displayName || user.email}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value as AdminUserTier)}
                    className="h-10 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={updateTier.isPending || detail.isFetching}
                  >
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleUpdateTier}
                    disabled={updateTier.isPending || detail.isFetching || selectedTier === user.tier}
                    className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {updateTier.isPending ? '更新中…' : '更新等級'}
                  </button>
                </div>
              </div>
            </section>
          )}

          <WalletManageSection
            userId={id}
            walletDetail={walletDetail}
            onAdjust={() => setAdjustOpen(true)}
          />

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">多帳號掃描</h2>
                <p className="mt-1 text-sm text-muted-foreground">掃描裝置、行為與帳號關聯訊號</p>
              </div>
              <button
                onClick={runScan}
                disabled={scan.isLoading || scan.isFetching}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {scan.isLoading || scan.isFetching ? '掃描中…' : scanEnabled ? '重新掃描' : '執行掃描'}
              </button>
            </div>
            {scan.error && <p className="mt-3 text-sm text-destructive">{extractApiError(scan.error, '掃描失敗')}</p>}
            {scan.data && (
              <div className={`mt-4 rounded-lg border p-4 ${scan.data.riskScore >= 60 ? 'border-red-200 bg-red-50' : 'border-border bg-background'}`}>
                <div className="flex items-center gap-3">
                  <p className={`text-3xl font-bold tabular-nums ${scan.data.riskScore >= 60 ? 'text-red-700' : 'text-green-700'}`}>
                    {scan.data.riskScore}
                  </p>
                  <div>
                    <p className="text-sm font-semibold">風險分數</p>
                    <p className="text-xs text-muted-foreground">{scan.data.riskScore >= 60 ? '高風險，建議人工複查' : '未達高風險門檻'}</p>
                  </div>
                </div>
                {scan.data.signals.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {scan.data.signals.map((signal, i) => (
                      <li key={`${signal.kind}-${i}`} className="rounded-md border border-border bg-white/70 px-3 py-2 text-sm">
                        <span className="font-medium">{signal.kind}</span>
                        <span className="mx-2 text-muted-foreground">權重 {signal.weight}</span>
                        <span className="text-muted-foreground">{signal.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">沒有偵測到明確關聯訊號</p>
                )}
                {scan.data.relatedUsers && scan.data.relatedUsers.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">可能相關帳號</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {scan.data.relatedUsers.map((related, i) => (
                        <span key={related.id ?? i} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                          {related.displayName ?? related.email ?? related.id ?? '未知帳號'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <RecentTransactions items={detail.data.recentTransactions} />
          <RecentResponses items={detail.data.recentResponses} />
        </div>
      )}
    </main>
  );
}

function TopCards({ data }: { data: AdminUserDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">基本資料</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Info label="名稱" value={data.user.displayName || '未命名使用者'} />
          <Info label="Email" value={data.user.email} />
          <Info label="狀態" value={<StatusBadge status={data.user.status} />} />
          <Info label="Role" value={data.user.role} />
          <Info label="VIP 等級" value={isAdminUserTier(data.user.tier) ? TIER_LABELS[data.user.tier] : data.user.tier} />
          <Info label="Email 驗證" value={data.user.emailVerified ? '已驗證' : '未驗證'} />
          <Info label="OAuth" value={data.oauthProviders.length > 0 ? data.oauthProviders.join(', ') : '無'} />
          <Info label="信譽分" value={data.reputationScore === null ? '無資料' : data.reputationScore.toString()} />
          <Info label="註冊" value={new Date(data.user.createdAt).toLocaleString('zh-TW')} />
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">錢包</h2>
        <div className="mt-4 grid gap-3">
          <Metric label="現金餘額" value={money(data.wallet?.cashBalance ?? 0)} />
          <Metric label="鎖定現金" value={money(data.wallet?.lockedCash ?? 0)} />
          <Metric label="積分餘額" value={(data.wallet?.pointsBalance ?? 0).toLocaleString()} />
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">統計</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="問卷" value={data.stats.surveyCount.toLocaleString()} />
          <Metric label="填答" value={data.stats.responseCount.toLocaleString()} />
          <Metric label="通過填答" value={data.stats.approvedResponseCount.toLocaleString()} />
          <Metric label="申訴" value={data.stats.appealCount.toLocaleString()} />
        </div>
      </section>
    </div>
  );
}

function RecentTransactions({ items }: { items: AdminUserDetail['recentTransactions'] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold">最近交易</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無交易紀錄</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">類型</th>
                <th className="py-2 font-medium">金額</th>
                <th className="py-2 font-medium">狀態</th>
                <th className="py-2 font-medium">備註</th>
                <th className="py-2 font-medium">時間</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2">{TYPE_LABELS[item.type] ?? item.type}</td>
                  <td className="py-2 tabular-nums">{money(item.amount)}</td>
                  <td className="py-2"><StatusBadge status={item.status} /></td>
                  <td className="max-w-xs truncate py-2 text-muted-foreground">{item.note ?? '—'}</td>
                  <td className="py-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecentResponses({ items }: { items: AdminUserDetail['recentResponses'] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold">最近填答</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無填答紀錄</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">問卷標題</th>
                <th className="py-2 font-medium">品質分</th>
                <th className="py-2 font-medium">狀態</th>
                <th className="py-2 font-medium">時間</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="max-w-md truncate py-2">{item.surveyTitle}</td>
                  <td className="py-2 tabular-nums">{item.qualityScore ?? '—'}</td>
                  <td className="py-2"><StatusBadge status={item.status} /></td>
                  <td className="py-2 text-xs text-muted-foreground">{new Date(item.submittedAt).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SuspendDialog({
  title,
  onConfirm,
  onCancel,
  isPending,
  error,
}: {
  title: string;
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
        <p className="mb-4 truncate text-sm text-muted-foreground">{title}</p>
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          停權後該用戶將立即無法登入
        </div>
        <label className="mb-1 block text-sm font-medium">停權原因（5-500 字）</label>
        <textarea
          className="h-28 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="請輸入停權原因"
        />
        <p className={`mt-1 text-xs ${valid || trimmed.length === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>{trimmed.length}/500</p>
        {error ? <p className="mt-2 text-sm text-destructive">{extractApiError(error, '停權失敗')}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
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

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function WalletManageSection({
  walletDetail,
  onAdjust,
}: {
  userId: string;
  walletDetail: ReturnType<typeof useAdminWallet>;
  onAdjust: () => void;
}) {
  const w = walletDetail.data?.wallet;
  const txns = walletDetail.data?.recentTransactions ?? [];
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">錢包管理</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">查看餘額明細並手動調整現金</p>
        </div>
        <button
          onClick={onAdjust}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          調整餘額
        </button>
      </div>

      {walletDetail.isLoading && <p className="mt-3 text-sm text-muted-foreground">載入中…</p>}
      {walletDetail.error && (
        <p className="mt-3 text-sm text-destructive">{extractApiError(walletDetail.error, '錢包資料載入失敗')}</p>
      )}

      {w && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">現金餘額</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{money(w.cashBalance)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">鎖定現金</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{money(w.lockedCash)}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">積分餘額</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{w.pointsBalance.toLocaleString()}</p>
          </div>
        </div>
      )}

      {txns.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">類型</th>
                <th className="py-2 font-medium">金額</th>
                <th className="py-2 font-medium">狀態</th>
                <th className="py-2 font-medium">備註</th>
                <th className="py-2 font-medium">時間</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((txn) => (
                <tr key={txn.id} className="border-b border-border last:border-0">
                  <td className="py-2">{TYPE_LABELS[txn.type] ?? txn.type}</td>
                  <td className="py-2 tabular-nums">{money(txn.amount)}</td>
                  <td className="py-2"><StatusBadge status={txn.status} /></td>
                  <td className="max-w-xs truncate py-2 text-muted-foreground">{txn.note ?? '—'}</td>
                  <td className="py-2 text-xs text-muted-foreground">{new Date(txn.createdAt).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdjustWalletDialog({
  currentBalance,
  onConfirm,
  onCancel,
  isPending,
  error,
}: {
  currentBalance: number;
  onConfirm: (amount: number, reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const [raw, setRaw] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const trimmedReason = reason.trim();
  const parsed = parseInt(raw, 10);
  const validAmount = raw !== '' && !isNaN(parsed) && parsed !== 0 && String(parsed) === raw;
  const validReason = trimmedReason.length >= 1 && trimmedReason.length <= 500;
  const canSubmit = validAmount && validReason;

  const preview = validAmount ? currentBalance + parsed : currentBalance;
  const isIncrease = validAmount && parsed > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    onConfirm(parsed, trimmedReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold">調整現金餘額</h3>
        <p className="mb-4 text-sm text-muted-foreground">目前餘額：{money(currentBalance)}</p>

        <label className="mb-1 block text-sm font-medium">調整金額（正數=增加，負數=扣除，整數 NT$）</label>
        <input
          type="number"
          step="1"
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="例：100 或 -50"
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setConfirmed(false); }}
        />

        {validAmount && (
          <p className={`mb-3 text-sm font-medium ${isIncrease ? 'text-green-700' : 'text-red-700'}`}>
            調整後餘額：{money(preview)}（{isIncrease ? `+${parsed}` : parsed}）
          </p>
        )}

        <label className="mb-1 block text-sm font-medium">調整原因（必填）</label>
        <textarea
          className="h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="請輸入調整原因（稽核用）"
          value={reason}
          onChange={(e) => { setReason(e.target.value); setConfirmed(false); }}
        />
        <p className={`mb-3 mt-1 text-xs ${validReason || trimmedReason.length === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
          {trimmedReason.length}/500
        </p>

        {confirmed && canSubmit && (
          <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            確認要{isIncrease ? '增加' : '扣除'} NT${Math.abs(parsed)} 嗎？此操作將產生稽核紀錄。
          </div>
        )}

        {error ? <p className="mb-2 text-sm text-destructive">{extractApiError(error, '調整失敗')}</p> : null}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? '處理中…' : confirmed ? '確認執行' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
