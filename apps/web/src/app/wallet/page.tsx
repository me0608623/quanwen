'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Coins, Banknote, TrendingUp, Clock, Ticket } from 'lucide-react';
import {
  useWallet,
  useWalletTransactions,
  usePointsSummary,
  usePointsTransactions,
  useMockDeposit,
  useEcpayDeposit,
  useRequestWithdrawal,
  useEarningsSummary,
  useMyCoupons,
} from '@/hooks/use-wallet';
import { useMe } from '@/hooks/use-auth';
import { cn } from '@/lib/cn';
import { EarningsChart } from '@/components/wallet/earnings-chart';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useEscapeKey } from '@/components/ui/use-escape-key';
import { useLockBodyScroll } from '@/components/ui/use-lock-body-scroll';
import { useFocusTrap } from '@/components/ui/use-focus-trap';

const IS_DEV = process.env.NODE_ENV !== 'production';

const TX_TYPE_LABELS: Record<string, string> = {
  deposit: '儲值',
  reward_out: '支付獎勵',
  reward_in: '獲得現金獎勵',
  platform_fee: '平台手續費',
  withdraw_request: '申請提領',
  withdraw_complete: '提領完成',
  refund: '退款',
  points_in: '獲得積分',
  points_spend: '積分兌換',
};

const TX_STATUS_LABELS: Record<string, string> = {
  pending: '處理中',
  processing: '撥款中',
  success: '完成',
  failed: '失敗',
  cancelled: '已取消',
};

const TX_STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-700',
  processing: 'text-blue-700',
  success: 'text-green-700',
  failed: 'text-red-600',
  cancelled: 'text-slate-500',
};

function isCreditType(type: string) {
  return type === 'deposit' || type === 'reward_in' || type === 'refund' || type === 'points_in';
}

// ─── 儲值 Dialog ────────────────────────────────────────────────────────────

function DepositDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useLockBodyScroll();
  useFocusTrap(dialogRef);
  const [amount, setAmount] = useState('');
  const mockDeposit = useMockDeposit();
  const ecpayDeposit = useEcpayDeposit();
  const isPending = mockDeposit.isPending || ecpayDeposit.isPending;
  const presets = [500, 1000, 3000, 5000];

  const handleSubmit = () => {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n < 100) return;
    if (IS_DEV) {
      mockDeposit.mutate(n, { onSuccess: onClose });
    } else {
      ecpayDeposit.mutate(n);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="儲值"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl"
      >
        <h3 className="mb-4 text-base font-semibold">{IS_DEV ? '儲值（開發模式）' : '儲值'}</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(String(p))}
              className={cn(
                'rounded-md border px-3 py-1 text-sm',
                amount === String(p)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted',
              )}
            >
              NT${p.toLocaleString()}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={100}
          max={100000}
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="自訂金額（最小 100）"
          aria-label="儲值金額"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {(mockDeposit.error || ecpayDeposit.error) && (
          <p className="mt-2 text-xs text-destructive">
            {((mockDeposit.error ?? ecpayDeposit.error) as Error).message}
          </p>
        )}
        {!IS_DEV && (
          <p className="mt-2 text-xs text-muted-foreground">點擊「確認儲值」後將跳轉至綠界支付頁面。</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !amount || parseInt(amount, 10) < 100}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            {isPending ? '處理中...' : '確認儲值'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 提領 Dialog ─────────────────────────────────────────────────────────────

function WithdrawDialog({ maxAmount, onClose }: { maxAmount: number; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useLockBodyScroll();
  useFocusTrap(dialogRef);
  const [form, setForm] = useState({ amount: '', bankCode: '', bankAccount: '', accountName: '' });
  const withdraw = useRequestWithdrawal();
  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const isValid =
    parseInt(form.amount, 10) >= 300 &&
    parseInt(form.amount, 10) <= maxAmount &&
    form.bankCode.length === 3 &&
    form.bankAccount.length >= 10 &&
    form.accountName.length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="申請提領"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl"
      >
        <h3 className="mb-4 text-base font-semibold">申請提領</h3>
        <div className="space-y-3">
          {[
            { label: '提領金額（NT$，最小 300）', field: 'amount', type: 'number', placeholder: `最多 NT$${Math.min(maxAmount, 30000).toLocaleString()}` },
            { label: '銀行代碼（3 碼）', field: 'bankCode', placeholder: '例：004（台灣銀行）' },
            { label: '銀行帳號', field: 'bankAccount', placeholder: '帳號（10-16 碼）' },
            { label: '戶名', field: 'accountName', placeholder: '銀行帳戶戶名' },
          ].map(({ label, field, type = 'text', placeholder }) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-medium">{label}</label>
              <input
                type={type}
                value={form[field as keyof typeof form]}
                onChange={(e) => update(field, e.target.value)}
                placeholder={placeholder}
                aria-label={label}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
        </div>
        {withdraw.error && <p className="mt-2 text-xs text-destructive">{(withdraw.error as Error).message}</p>}
        <p className="mt-3 text-xs text-muted-foreground">提領手續費 NT$15，預計 1-3 個工作日撥款。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
          <button
            onClick={() => withdraw.mutate({ amount: parseInt(form.amount, 10), bankCode: form.bankCode, bankAccount: form.bankAccount, accountName: form.accountName }, { onSuccess: onClose })}
            disabled={withdraw.isPending || !isValid}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            送出申請
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 積分卡片 ────────────────────────────────────────────────────────────────

function PointsCard() {
  const { data: summary, isLoading } = usePointsSummary();

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (!summary) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-amber-500" />
        <span className="text-sm font-semibold text-amber-800">平台積分</span>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          1 積分 ≈ NT$0.5
        </span>
      </div>

      <p className="text-4xl font-bold tabular-nums text-amber-900">
        {summary.balance.toLocaleString()}
        <span className="ml-1 text-lg font-normal text-amber-600">積分</span>
      </p>
      <p className="mt-1 text-sm text-amber-700">≈ NT${summary.estimatedValue.toLocaleString()} 等值</p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-amber-200 pt-4">
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="累計獲得" value={`${summary.totalEarned.toLocaleString()} 積分`} />
        <Stat icon={<Clock className="h-3.5 w-3.5" />} label="本月獲得" value={`${summary.thisMonth.toLocaleString()} 積分`} />
        <Stat icon={<Coins className="h-3.5 w-3.5" />} label="已兌換" value={`${summary.totalSpent.toLocaleString()} 積分`} />
      </div>

      <p className="mt-4 text-xs text-amber-600">
        積分可於未來「積分商城」兌換實體商品。Beta 期間暫不支援提領。
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="mb-1 flex items-center justify-center gap-1 text-amber-500">{icon}</div>
      <p className="text-xs text-amber-600">{label}</p>
      <p className="text-xs font-semibold text-amber-800">{value}</p>
    </div>
  );
}

// ─── 交易列表 ────────────────────────────────────────────────────────────────

function TxList({ txns }: { txns: { id: string; type: string; amount: number; status: string; note: string | null; createdAt: string }[] }) {
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  if (txns.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">尚無交易紀錄</p>
      </div>
    );
  }
  const shown = txns.filter(
    (t) => filter === 'all' || (filter === 'credit' ? isCreditType(t.type) : !isCreditType(t.type)),
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {([['all', '全部'], ['credit', '收入'], ['debit', '支出']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          沒有符合的交易
        </p>
      ) : (
        shown.map((tx) => (
        <div key={tx.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{TX_TYPE_LABELS[tx.type] ?? tx.type}</p>
            {tx.note && <p className="truncate text-xs text-muted-foreground">{tx.note}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString('zh-TW')}</p>
          </div>
          <div className="ml-4 shrink-0 text-right">
            <p className={cn('text-sm font-semibold tabular-nums', isCreditType(tx.type) ? 'text-green-700' : 'text-foreground')}>
              {isCreditType(tx.type) ? '+' : '-'}
              {tx.type === 'points_in' || tx.type === 'points_spend'
                ? `${tx.amount.toLocaleString()} 積分`
                : `NT$${tx.amount.toLocaleString()}`}
            </p>
            <p className={cn('text-xs', TX_STATUS_COLORS[tx.status] ?? 'text-muted-foreground')}>
              {TX_STATUS_LABELS[tx.status] ?? tx.status}
            </p>
          </div>
        </div>
        ))
      )}
    </div>
  );
}

// ─── 優惠券夾 ────────────────────────────────────────────────────────────────
// 企業品牌問卷通過品質審核後獲得的優惠券,集中存放在這裡(淡金色)。

const COUPON_STATUS_LABELS: Record<string, string> = {
  active: '可使用',
  used: '已使用',
  expired: '已過期',
};

function CouponFolder() {
  const { data: coupons = [], isLoading } = useMyCoupons();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-[#FBF3DC]" />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E5CF8C] bg-gradient-to-br from-[#FBF3DC] to-[#F3E3AC] p-6">
        <div className="mb-1 flex items-center gap-2">
          <Ticket className="h-5 w-5 text-[#A07D14]" />
          <span className="text-sm font-semibold text-[#8A6D0B]">優惠券夾</span>
          <span className="ml-auto rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#A07D14]">
            {coupons.filter((c) => c.status === 'active').length} 張可用
          </span>
        </div>
        <p className="text-xs text-[#A07D14]">
          完成「企業品牌問卷」並通過品質審核，獲得的優惠券會自動存放在這裡。
        </p>
      </div>

      {coupons.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[#E5CF8C] bg-[#FBF3DC]/30 p-10 text-center">
          <p className="text-3xl">🎟️</p>
          <p className="mt-2 text-sm font-semibold text-[#8A6D0B]">還沒有優惠券</p>
          <p className="mt-1 text-xs text-[#A07D14]">
            到任務頁的「👑 企業品牌問卷」分頁，1 分鐘填寫即可賺優惠券
          </p>
          <a href="/tasks" className="mt-3 inline-block text-sm font-semibold text-[#A07D14] underline hover:text-[#6B5408]">
            去看看品牌問卷 →
          </a>
        </div>
      ) : (
        <div className="space-y-2.5">
          {coupons.map((c) => {
            const inactive = c.status !== 'active';
            return (
              <div
                key={c.id}
                className={cn(
                  'relative overflow-hidden rounded-xl border p-4',
                  inactive
                    ? 'border-border bg-muted/40 opacity-60'
                    : 'border-[#E5CF8C] bg-gradient-to-br from-[#FFFDF6] to-[#FBF3DC]',
                )}
              >
                {/* 票券打孔裝飾 */}
                <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
                <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
                <div className="flex items-center justify-between gap-3 pl-2 pr-2">
                  <div className="min-w-0 flex-1">
                    {c.brandName && (
                      <p className="text-[11px] font-semibold text-[#B8962E]">👑 {c.brandName}</p>
                    )}
                    <p className={cn('truncate text-sm font-bold', inactive ? 'text-muted-foreground' : 'text-[#5C470A]')}>
                      🎟️ {c.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#A07D14]">
                      {new Date(c.acquiredAt).toLocaleDateString('zh-TW')} 取得
                      {c.expiresAt && ` · ${new Date(c.expiresAt).toLocaleDateString('zh-TW')} 到期`}
                      {' · '}{COUPON_STATUS_LABELS[c.status] ?? c.status}
                    </p>
                  </div>
                  {c.code && !inactive && (
                    <button
                      onClick={() => copyCode(c.id, c.code!)}
                      className="shrink-0 rounded-md border border-dashed border-[#C9A227] bg-white/70 px-3 py-1.5 font-mono text-xs font-bold text-[#8A6D0B] transition hover:bg-white"
                    >
                      {copiedId === c.id ? '已複製 ✓' : c.code}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 主頁面 ──────────────────────────────────────────────────────────────────

function WalletContent() {
  const searchParams = useSearchParams();
  const { data: me } = useMe();
  const { data: wallet, isLoading, isError, refetch } = useWallet();
  const { data: cashTxns = [], refetch: refetchTxns } = useWalletTransactions();
  const { data: pointsTxns = [] } = usePointsTransactions();
  const { data: earnings } = useEarningsSummary();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cash' | 'points' | 'coupons'>('cash');
  const { data: myCoupons = [] } = useMyCoupons();

  useEffect(() => {
    if (searchParams.get('deposit') === 'done') {
      setBanner('付款完成！餘額將在確認後更新。');
      refetch();
      refetchTxns();
      setTimeout(() => setBanner(null), 5000);
    }
  }, [searchParams, refetch, refetchTxns]);

  const isSurveyor = me?.role === 'surveyor';
  const isRespondent = me?.role === 'respondent';

  if (isLoading) return <main className="mx-auto max-w-xl px-4 py-10"><LoadingSpinner /></main>;
  if (isError) return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">錢包載入失敗。</p>
        <button
          onClick={() => refetch()}
          className="mt-2 rounded-md border border-destructive/40 px-4 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          重試
        </button>
      </div>
    </main>
  );

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="sr-only">我的錢包</h1>
      {banner && <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{banner}</div>}
      {showDeposit && <DepositDialog onClose={() => { setShowDeposit(false); refetch(); refetchTxns(); }} />}
      {showWithdraw && <WithdrawDialog maxAmount={wallet?.cashBalance ?? 0} onClose={() => setShowWithdraw(false)} />}

      {/* Tab 切換 — Phase A 法規語義：受試者用「我的收益」避免電支條例「儲值」字眼 */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <TabButton
          active={activeTab === 'cash'}
          onClick={() => setActiveTab('cash')}
          icon={<Banknote className="h-4 w-4" />}
          label={isRespondent ? '我的收益' : '現金錢包'}
        />
        <TabButton active={activeTab === 'points'} onClick={() => setActiveTab('points')} icon={<Coins className="h-4 w-4" />} label="積分" badge={wallet?.pointsBalance ? wallet.pointsBalance.toLocaleString() : undefined} />
        <TabButton
          active={activeTab === 'coupons'}
          onClick={() => setActiveTab('coupons')}
          icon={<Ticket className="h-4 w-4" />}
          label="優惠券夾"
          badge={myCoupons.filter((c) => c.status === 'active').length > 0 ? String(myCoupons.filter((c) => c.status === 'active').length) : undefined}
        />
      </div>

      {activeTab === 'cash' && (
        <>
          {/* 現金餘額卡片 */}
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              {isRespondent ? '待領取獎勵' : '可用餘額'}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums">
              NT${(wallet?.cashBalance ?? 0).toLocaleString()}
            </p>
            {isRespondent && (
              <p className="mt-1 text-[10px] text-slate-400">
                ⓘ 款項由綠界託管，平台不持有現金
              </p>
            )}
            {(wallet?.lockedCash ?? 0) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                鎖定中：NT${wallet!.lockedCash.toLocaleString()}（申請提領中）
              </p>
            )}
            <div className="mt-4 flex gap-2">
              {isSurveyor && (
                <button onClick={() => setShowDeposit(true)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  儲值
                </button>
              )}
              {isRespondent && (
                <button
                  onClick={() => setShowWithdraw(true)}
                  disabled={(wallet?.cashBalance ?? 0) < 300}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  申請提領
                </button>
              )}
            </div>
          </div>

          {/* Phase GG: 受試者收益視覺化（trend + bySurvey） */}
          {isRespondent && earnings && (earnings.monthly.length > 0 || earnings.bySurvey.length > 0) && (
            <EarningsChart summary={earnings} />
          )}

          {/* 現金交易紀錄 */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">交易紀錄</h2>
            <TxList txns={cashTxns} />
          </section>
        </>
      )}

      {activeTab === 'points' && (
        <>
          <PointsCard />

          {/* 積分交易紀錄 */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">積分明細</h2>
            <TxList txns={pointsTxns} />
          </section>
        </>
      )}

      {activeTab === 'coupons' && <CouponFolder />}
    </main>
  );
}

function TabButton({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800',
      )}
    >
      {icon}
      {label}
      {badge && (
        <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-bold', active ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700')}>
          {badge}
        </span>
      )}
    </button>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-10"><LoadingSpinner /></main>}>
      <WalletContent />
    </Suspense>
  );
}
