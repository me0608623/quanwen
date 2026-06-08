'use client';

import { useState } from 'react';
import { useAdminSurveys, useApproveSurvey, useRejectSurvey, useSurveyAiReview, AdminSurvey } from '@/hooks/use-admin';
import {
  AdminPageHeader,
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

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '待審核',
  published: '已發布',
  paused: '暫停',
  closed: '已關閉',
  rejected: '已拒絕',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = {
  pending_review: 'amber',
  published: 'green',
  rejected: 'red',
  closed: 'neutral',
  paused: 'amber',
  draft: 'neutral',
};

export default function AdminSurveysPage() {
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [rejectTarget, setRejectTarget] = useState<AdminSurvey | null>(null);

  const { data: surveys = [], isLoading } = useAdminSurveys(statusFilter || undefined);
  const approve = useApproveSurvey();
  const reject = useRejectSurvey();

  const handleRejectConfirm = (reason: string) => {
    if (!rejectTarget) return;
    reject.mutate(
      { id: rejectTarget.id, reason },
      { onSuccess: () => setRejectTarget(null) },
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {rejectTarget && (
        <ReasonDialog
          title="拒絕問卷"
          subtitle={`「${rejectTarget.title}」`}
          label="拒絕原因（必填）"
          placeholder="請輸入拒絕理由，將通知問券方"
          confirmLabel="確認拒絕"
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isPending={reject.isPending}
        />
      )}

      <AdminPageHeader
        title="問卷審核"
        subtitle="審核問券方送出的問卷，可請 AI 給意見"
        right={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#126b8a]"
          >
            <option value="pending_review">待審核</option>
            <option value="published">已發布</option>
            <option value="rejected">已拒絕</option>
            <option value="closed">已關閉</option>
            <option value="">全部</option>
          </select>
        }
      />

      {isLoading && <RowsSkeleton rows={4} />}

      {!isLoading && surveys.length === 0 && <EmptyState>目前沒有符合條件的問卷</EmptyState>}

      <div className="space-y-3">
        {surveys.map((survey) => (
          <SurveyRow
            key={survey.id}
            survey={survey}
            onApprove={() => approve.mutate(survey.id)}
            onReject={() => setRejectTarget(survey)}
            approving={approve.isPending}
          />
        ))}
      </div>
    </main>
  );
}

// ─── Survey Row (with AI review panel) ───────────────────────────────────────

function SurveyRow({
  survey, onApprove, onReject, approving,
}: {
  survey: AdminSurvey;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const { data: aiReview, isLoading: aiLoading, error: aiError } = useSurveyAiReview(survey.id, reviewOpen);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{survey.title}</h2>
            <Pill tone={STATUS_TONE[survey.status] ?? 'neutral'}>{STATUS_LABELS[survey.status] ?? survey.status}</Pill>
            {survey.aiScore !== null && (
              <span className={`shrink-0 text-xs font-medium tabular-nums ${survey.aiScore >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                AI 分數 {survey.aiScore}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {survey.questionCount} 題 · 建立於 {new Date(survey.createdAt).toLocaleDateString('zh-TW')}
            {survey.publishedAt && ` · 發布於 ${new Date(survey.publishedAt).toLocaleDateString('zh-TW')}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {survey.status === 'pending_review' && (
            <>
              <AiToggleButton open={reviewOpen} onClick={() => setReviewOpen((v) => !v)} label="請 AI 給意見" />
              <PrimaryButton onClick={onApprove} disabled={approving}>通過</PrimaryButton>
              <DangerButton onClick={onReject}>拒絕</DangerButton>
            </>
          )}
        </div>
      </div>

      {reviewOpen && (
        <AiPanel>
          {aiLoading && <AiSkeleton label="AI 審核諮詢中…（通常 15-30 秒）" />}
          {aiError && <AiError />}
          {aiReview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <AiPanelLabel>AI 審核建議</AiPanelLabel>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-extrabold tabular-nums ${aiReview.score >= 80 ? 'text-green-600' : aiReview.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {aiReview.score}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                </div>
                <Pill tone={aiReview.passed ? 'green' : 'red'}>{aiReview.passed ? '建議核准' : '建議退回'}</Pill>
              </div>

              {aiReview.issues.length > 0 && (
                <div>
                  <AiSubLabel>問題</AiSubLabel>
                  <FlagList items={aiReview.issues} tone="amber" />
                </div>
              )}

              {aiReview.suggestion && (
                <div>
                  <AiSubLabel>改進建議</AiSubLabel>
                  <AiPara>{aiReview.suggestion}</AiPara>
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
