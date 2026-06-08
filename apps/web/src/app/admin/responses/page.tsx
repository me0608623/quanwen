'use client';

import { useState } from 'react';
import {
  useApproveResponse,
  useReAuditResponse,
  useRejectResponse,
  useResponseAiAnalysis,
  useSuspiciousResponses,
} from '@/hooks/use-admin';
import { extractApiError } from '@/lib/extract-error';
import {
  AdminPageHeader,
  CountBadge,
  Pill,
  PrimaryButton,
  DangerButton,
  GhostButton,
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
} from '@/components/admin/ui';

type SuspiciousRow = {
  id: string;
  surveyTitle: string;
  antiCheatScore: number;
  suspiciousFlags: string[];
  fillDurationSeconds: number | null;
  submittedAt: string;
  status: string;
};

function ScoreBadge({ score }: { score: number }) {
  return <Pill tone={score >= 80 ? 'red' : 'amber'}>可疑分 {score}</Pill>;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function AdminResponsesPage() {
  const { data: responses = [], isLoading } = useSuspiciousResponses();
  const rejectResponse = useRejectResponse();
  const approveResponse = useApproveResponse();
  const reAuditResponse = useReAuditResponse();

  const handleReject = async (id: string) => {
    try {
      await rejectResponse.mutateAsync(id);
      alert('已標記為無效填答');
    } catch (err) {
      alert(extractApiError(err, '標記無效失敗'));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveResponse.mutateAsync(id);
      alert('已核准為有效填答');
    } catch (err) {
      alert(extractApiError(err, '核准失敗'));
    }
  };

  const handleReAudit = async (id: string) => {
    try {
      await reAuditResponse.mutateAsync(id);
      alert('重新審核完成');
    } catch (err) {
      alert(extractApiError(err, '重新審核失敗'));
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminPageHeader
        title="可疑填答"
        subtitle="反作弊分數 ≥ 60 的填答紀錄，可請 AI 解讀"
        right={<CountBadge n={responses.length} label="筆待審查" />}
      />

      {isLoading && <RowsSkeleton rows={4} />}

      {!isLoading && responses.length === 0 && <EmptyState>目前沒有可疑填答</EmptyState>}

      <div className="space-y-3">
        {responses.map((r) => (
          <ResponseRow
            key={r.id}
            r={r as SuspiciousRow}
            onReject={() => handleReject(r.id)}
            onApprove={() => handleApprove(r.id)}
            onReAudit={() => handleReAudit(r.id)}
            rejecting={rejectResponse.isPending}
            approving={approveResponse.isPending}
            reAuditing={reAuditResponse.isPending}
          />
        ))}
      </div>
    </main>
  );
}

// ─── Response Row ────────────────────────────────────────────────────────────

function ResponseRow({
  r, onReject, onApprove, onReAudit, rejecting, approving, reAuditing,
}: {
  r: SuspiciousRow;
  onReject: () => void;
  onApprove: () => void;
  onReAudit: () => void;
  rejecting: boolean;
  approving: boolean;
  reAuditing: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const { data: ai, isLoading: aiLoading, error: aiError } = useResponseAiAnalysis(r.id, aiOpen);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{r.surveyTitle}</p>
            <ScoreBadge score={r.antiCheatScore} />
            {r.status === 'rejected' && <Pill tone="neutral">已拒絕</Pill>}
            {r.status === 'pending_review' && <Pill tone="amber">待人工審核</Pill>}
          </div>

          {r.suspiciousFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.suspiciousFlags.map((flag) => (
                <span key={flag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {flag}
                </span>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            填答時長 {formatDuration(r.fillDurationSeconds)} · 提交於 {new Date(r.submittedAt).toLocaleString('zh-TW')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AiToggleButton open={aiOpen} onClick={() => setAiOpen((v) => !v)} label="AI 分析" />
          {r.status !== 'rejected' && (
            <GhostButton onClick={onReAudit} disabled={reAuditing}>重新審核</GhostButton>
          )}
          {r.status !== 'rejected' && (
            <DangerButton onClick={onReject} disabled={rejecting}>標記無效</DangerButton>
          )}
          {r.status === 'pending_review' && (
            <PrimaryButton onClick={onApprove} disabled={approving}>核准有效</PrimaryButton>
          )}
        </div>
      </div>

      {aiOpen && (
        <AiPanel>
          {aiLoading && <AiSkeleton label="AI 分析中…（通常 15-30 秒）" />}
          {aiError && <AiError />}
          {ai && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <AiPanelLabel>AI 分析</AiPanelLabel>
                <SeverityBadge severity={ai.severity} />
                <RecommendationBadge recommendation={ai.recommendation} />
              </div>

              <AiPara>{ai.reasoning}</AiPara>

              {ai.signals.length > 0 && (
                <div>
                  <AiSubLabel>具體訊號</AiSubLabel>
                  <FlagList items={ai.signals} tone="amber" />
                </div>
              )}

              <div>
                <AiSubLabel>處置建議</AiSubLabel>
                <AiPara>{ai.recommendationReason}</AiPara>
              </div>

              <AiDisclaimer />
            </div>
          )}
        </AiPanel>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const cfg = {
    low: { label: '輕度可疑', tone: 'neutral' as const },
    medium: { label: '中度可疑', tone: 'amber' as const },
    high: { label: '嚴重可疑', tone: 'red' as const },
  }[severity];
  return <Pill tone={cfg.tone}>{cfg.label}</Pill>;
}

function RecommendationBadge({ recommendation }: { recommendation: 'reject' | 'review_more' | 'accept' }) {
  const cfg = {
    reject: { label: '建議拒絕', tone: 'red' as const },
    review_more: { label: '需查更多', tone: 'amber' as const },
    accept: { label: '可接受', tone: 'green' as const },
  }[recommendation];
  return <Pill tone={cfg.tone}>→ {cfg.label}</Pill>;
}
