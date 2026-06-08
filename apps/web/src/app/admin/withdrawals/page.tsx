'use client';

import { useState } from 'react';
import {
  usePendingWithdrawals,
  useApproveWithdrawal,
  useRejectWithdrawal,
  useWithdrawalAiRisk,
  PendingWithdrawal,
} from '@/hooks/use-admin';
import {
  AdminPageHeader,
  CountBadge,
  Pill,
  PrimaryButton,
  DangerButton,
  AiToggleButton,
  AiPanel,
  AiPanelLabel,
  AiSkeleton,
  AiError,
  AiPara,
  AiSubLabel,
  FlagList,
  AiDisclaimer,
  RowsSkeleton,
  EmptyState,
  ReasonDialog,
} from '@/components/admin/ui';

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
    <main className="mx-auto max-w-4xl px-4 py-8">
      {rejectTarget && (
        <ReasonDialog
          title="拒絕提領申請"
          subtitle={`NT$${rejectTarget.amount.toLocaleString()} — 戶名：${rejectTarget.metadata?.accountName ?? '—'}`}
          label="拒絕原因（必填）"
          placeholder="請輸入拒絕原因"
          confirmLabel="確認拒絕"
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isPending={reject.isPending}
        />
      )}

      <AdminPageHeader
        title="提領審核"
        subtitle="待撥款的受試者提領申請"
        right={<CountBadge n={withdrawals.length} label="筆待審核" />}
      />

      {isLoading && <RowsSkeleton rows={3} />}

      {!isLoading && withdrawals.length === 0 && <EmptyState>目前沒有待審核的提領申請</EmptyState>}

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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tabular-nums">NT${w.amount.toLocaleString()}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            {w.metadata?.accountName && <span>戶名：{w.metadata.accountName}</span>}
            {w.metadata?.bankCode && <span>銀行：{w.metadata.bankCode}</span>}
            {w.metadata?.bankAccount && <span className="tabular-nums">帳號：{w.metadata.bankAccount}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            申請時間：{new Date(w.createdAt).toLocaleString('zh-TW')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AiToggleButton open={aiOpen} onClick={() => setAiOpen((v) => !v)} label="AI 風險" />
          <PrimaryButton onClick={onApprove} disabled={approving}>核准撥款</PrimaryButton>
          <DangerButton onClick={onReject}>拒絕</DangerButton>
        </div>
      </div>

      {aiOpen && (
        <AiPanel>
          {riskLoading && <AiSkeleton label="AI 詐欺風險評估中…" />}
          {riskError && <AiError />}
          {risk && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <AiPanelLabel>AI 風險評估</AiPanelLabel>
                <RiskPill level={risk.riskLevel} />
                <RecommendPill recommendation={risk.recommendation} />
              </div>

              <AiPara>{risk.reasoning}</AiPara>

              {risk.redFlags.length > 0 && (
                <div>
                  <AiSubLabel>紅旗訊號</AiSubLabel>
                  <FlagList items={risk.redFlags} tone="red" />
                </div>
              )}

              <AiDisclaimer />
            </div>
          )}
        </AiPanel>
      )}
    </div>
  );
}

function RiskPill({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cfg = {
    low: { label: '低風險', tone: 'green' as const },
    medium: { label: '中風險', tone: 'amber' as const },
    high: { label: '高風險', tone: 'red' as const },
  }[level];
  return <Pill tone={cfg.tone}>{cfg.label}</Pill>;
}

function RecommendPill({ recommendation }: { recommendation: 'approve' | 'manual_review' | 'reject' }) {
  const cfg = {
    approve: { label: '可核准', tone: 'green' as const },
    manual_review: { label: '需人工複審', tone: 'amber' as const },
    reject: { label: '建議拒絕', tone: 'red' as const },
  }[recommendation];
  return <Pill tone={cfg.tone}>→ {cfg.label}</Pill>;
}
