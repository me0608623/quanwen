'use client';

import { useState } from 'react';
import {
  usePendingWithdrawals,
  useApproveWithdrawal,
  useRejectWithdrawal,
  useWithdrawalAiRisk,
  PendingWithdrawal,
} from '@/hooks/use-admin';

function RejectDialog({
  withdrawal,
  onConfirm,
  onCancel,
  isPending,
}: {
  withdrawal: PendingWithdrawal;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-1">拒絕提領申請</h3>
        <p className="text-sm text-muted-foreground mb-4">
          NT${withdrawal.amount.toLocaleString()} — 戶名：{withdrawal.metadata?.accountName ?? '—'}
        </p>
        <label className="block text-sm font-medium mb-1">拒絕原因（必填）</label>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="請輸入拒絕原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            取消
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-destructive/90"
          >
            確認拒絕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminWithdrawalsPage() {
  const { data: withdrawals = [], isLoading } = usePendingWithdrawals();
  const approve = useApproveWithdrawal();
  const reject = useRejectWithdrawal();
  const [rejectTarget, setRejectTarget] = useState<PendingWithdrawal | null>(null);

  const handleRejectConfirm = (reason: string) => {
    if (!rejectTarget) return;
    reject.mutate({ id: rejectTarget.id, reason }, { onSuccess: () => setRejectTarget(null) });
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {rejectTarget && (
        <RejectDialog
          withdrawal={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isPending={reject.isPending}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">提領審核</h1>
          <p className="text-sm text-muted-foreground mt-1">待撥款的受試者提領申請</p>
        </div>
        {withdrawals.length > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
            {withdrawals.length} 筆待審核
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!isLoading && withdrawals.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有待審核的提領申請</p>
        </div>
      )}

      <div className="space-y-3">
        {withdrawals.map((w) => (
          <WithdrawalRow
            key={w.id}
            w={w}
            onApprove={() => approve.mutate(w.id)}
            onReject={() => setRejectTarget(w)}
            approving={approve.isPending}
          />
        ))}
      </div>
    </main>
  );
}

// ─── Withdrawal Row with AI Risk Panel ──────────────────────────────────────

function WithdrawalRow({
  w, onApprove, onReject, approving,
}: {
  w: PendingWithdrawal;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const { data: risk, isLoading: riskLoading, error: riskError } = useWithdrawalAiRisk(w.id, aiOpen);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">NT${w.amount.toLocaleString()}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            {w.metadata?.accountName && <span>戶名：{w.metadata.accountName}</span>}
            {w.metadata?.bankCode && <span>銀行：{w.metadata.bankCode}</span>}
            {w.metadata?.bankAccount && <span>帳號：{w.metadata.bankAccount}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            申請時間：{new Date(w.createdAt).toLocaleString('zh-TW')}
          </p>
        </div>

        <div className="flex shrink-0 gap-2 items-center">
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1.5 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
          >
            ✨ {aiOpen ? '收起' : 'AI 風險'}
          </button>
          <button
            onClick={onApprove}
            disabled={approving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            核准撥款
          </button>
          <button
            onClick={onReject}
            className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            拒絕
          </button>
        </div>
      </div>

      {aiOpen && (
        <div className="mt-4 rounded-lg border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.03] p-4">
          {riskLoading && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                ✨ AI 詐欺風險評估中…
              </p>
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-2.5 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 10}%` }} />
                ))}
              </div>
            </div>
          )}
          {riskError && (
            <p className="text-xs text-red-600">AI 服務暫時無法使用，請以人工判斷為主</p>
          )}
          {risk && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                  ✨ AI 風險評估
                </p>
                <RiskBadge level={risk.riskLevel} />
                <RiskRecommendation recommendation={risk.recommendation} />
              </div>

              <p className="text-sm text-slate-700 leading-relaxed bg-white/60 rounded p-3 border border-[#126b8a]/15">
                {risk.reasoning}
              </p>

              {risk.redFlags.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    🚩 紅旗訊號
                  </p>
                  <ul className="space-y-1">
                    {risk.redFlags.map((f, i) => (
                      <li key={i} className="text-xs text-slate-700 border-l-2 border-red-400 bg-red-50/40 pl-2 py-1">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-slate-400 text-right">
                ⓘ 此為 AI 諮詢意見，最終由人工判斷
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cfg = {
    low: { label: '低風險', cls: 'bg-green-100 text-green-700' },
    medium: { label: '中風險', cls: 'bg-amber-100 text-amber-700' },
    high: { label: '高風險', cls: 'bg-red-100 text-red-700' },
  }[level];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function RiskRecommendation({ recommendation }: { recommendation: 'approve' | 'manual_review' | 'reject' }) {
  const cfg = {
    approve: { label: '可核准', cls: 'bg-green-100 text-green-700' },
    manual_review: { label: '需人工複審', cls: 'bg-amber-100 text-amber-700' },
    reject: { label: '建議拒絕', cls: 'bg-red-100 text-red-700' },
  }[recommendation];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      → {cfg.label}
    </span>
  );
}
