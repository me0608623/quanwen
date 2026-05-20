'use client';

import { useState } from 'react';
import { useAdminSurveys, useApproveSurvey, useRejectSurvey, useSurveyAiReview, AdminSurvey } from '@/hooks/use-admin';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '待審核',
  published: '已發布',
  paused: '暫停',
  closed: '已關閉',
  rejected: '已拒絕',
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-600',
  paused: 'bg-orange-100 text-orange-800',
  draft: 'bg-gray-100 text-gray-500',
};

function RejectDialog({
  survey,
  onConfirm,
  onCancel,
  isPending,
}: {
  survey: AdminSurvey;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-1">拒絕問卷</h3>
        <p className="text-sm text-muted-foreground mb-4 truncate">「{survey.title}」</p>
        <label className="block text-sm font-medium mb-1">拒絕原因（必填）</label>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="請輸入拒絕理由，將通知問券方"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
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
    <main className="mx-auto max-w-5xl px-4 py-10">
      {rejectTarget && (
        <RejectDialog
          survey={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isPending={reject.isPending}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">問卷審核</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="pending_review">待審核</option>
          <option value="published">已發布</option>
          <option value="rejected">已拒絕</option>
          <option value="closed">已關閉</option>
          <option value="">全部</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!isLoading && surveys.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有符合條件的問卷</p>
        </div>
      )}

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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate">{survey.title}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[survey.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[survey.status] ?? survey.status}
            </span>
            {survey.aiScore !== null && (
              <span className={`shrink-0 text-xs font-medium ${survey.aiScore >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                AI 分數 {survey.aiScore}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {survey.questionCount} 題 · 建立於 {new Date(survey.createdAt).toLocaleDateString('zh-TW')}
            {survey.publishedAt && ` · 發布於 ${new Date(survey.publishedAt).toLocaleDateString('zh-TW')}`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2 items-center">
          {survey.status === 'pending_review' && (
            <button
              onClick={() => setReviewOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1.5 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
            >
              ✨ {reviewOpen ? '收起' : '請 AI 給意見'}
            </button>
          )}
          {survey.status === 'pending_review' && (
            <>
              <button
                onClick={onApprove}
                disabled={approving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
              >
                通過
              </button>
              <button
                onClick={onReject}
                className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                拒絕
              </button>
            </>
          )}
        </div>
      </div>

      {/* AI Review panel (inline expand) */}
      {reviewOpen && (
        <div className="mt-4 rounded-lg border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.03] p-4">
          {aiLoading && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                ✨ AI 審核諮詢中...（LLM 通常 15-30 秒）
              </p>
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-2.5 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 10}%` }} />
                ))}
              </div>
            </div>
          )}
          {aiError && (
            <p className="text-xs text-red-600">AI 服務暫時無法使用，請以人工判斷為主</p>
          )}
          {aiReview && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                  ✨ AI 審核建議
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-2xl font-extrabold ${aiReview.score >= 80 ? 'text-green-600' : aiReview.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {aiReview.score}
                  </span>
                  <span className="text-xs text-slate-500">/ 100</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${aiReview.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {aiReview.passed ? '建議核准' : '建議退回'}
                </span>
              </div>

              {aiReview.issues.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">問題</p>
                  <ul className="space-y-1">
                    {aiReview.issues.map((issue, i) => (
                      <li key={i} className="text-xs text-slate-700 border-l-2 border-amber-400 bg-amber-50/40 pl-2 py-1">
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiReview.suggestion && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">改進建議</p>
                  <p className="text-xs text-slate-700 leading-relaxed bg-white/60 rounded p-2 border border-[#126b8a]/15">
                    {aiReview.suggestion}
                  </p>
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
