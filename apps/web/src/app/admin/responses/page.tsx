'use client';

import { useState } from 'react';
import { useSuspiciousResponses, useRejectResponse, useResponseAiAnalysis } from '@/hooks/use-admin';

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
  const color =
    score >= 80 ? 'bg-red-100 text-red-700' :
    score >= 60 ? 'bg-orange-100 text-orange-700' :
    'bg-yellow-100 text-yellow-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      可疑分 {score}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function AdminResponsesPage() {
  const { data: responses = [], isLoading } = useSuspiciousResponses();
  const rejectResponse = useRejectResponse();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">可疑填答</h1>
          <p className="text-sm text-muted-foreground mt-1">反作弊分數 ≥ 60 的填答紀錄，可請 AI 解讀</p>
        </div>
        {responses.length > 0 && (
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
            {responses.length} 筆待審查
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!isLoading && responses.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有可疑填答</p>
        </div>
      )}

      <div className="space-y-3">
        {responses.map((r) => (
          <ResponseRow
            key={r.id}
            r={r as SuspiciousRow}
            onReject={() => rejectResponse.mutate(r.id)}
            rejecting={rejectResponse.isPending}
          />
        ))}
      </div>
    </main>
  );
}

// ─── Response Row ────────────────────────────────────────────────────────────

function ResponseRow({
  r, onReject, rejecting,
}: {
  r: SuspiciousRow;
  onReject: () => void;
  rejecting: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const { data: ai, isLoading: aiLoading, error: aiError } = useResponseAiAnalysis(r.id, aiOpen);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{r.surveyTitle}</p>
            <ScoreBadge score={r.antiCheatScore} />
            {r.status === 'rejected' && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">已拒絕</span>
            )}
          </div>

          {r.suspiciousFlags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {r.suspiciousFlags.map((flag) => (
                <span
                  key={flag}
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            填答時長 {formatDuration(r.fillDurationSeconds)} ·{' '}
            提交於 {new Date(r.submittedAt).toLocaleString('zh-TW')}
          </p>
        </div>

        <div className="flex shrink-0 gap-2 items-center">
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1.5 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
          >
            ✨ {aiOpen ? '收起' : 'AI 分析'}
          </button>
          {r.status !== 'rejected' && (
            <button
              onClick={onReject}
              disabled={rejecting}
              className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10"
            >
              標記無效
            </button>
          )}
        </div>
      </div>

      {/* AI 分析 panel */}
      {aiOpen && (
        <div className="mt-4 rounded-lg border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.03] p-4">
          {aiLoading && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                ✨ AI 分析中…（通常 15-30 秒）
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
          {ai && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#126b8a]">
                  ✨ AI 分析
                </p>
                <SeverityBadge severity={ai.severity} />
                <RecommendationBadge recommendation={ai.recommendation} />
              </div>

              <p className="text-sm text-slate-700 leading-relaxed bg-white/60 rounded p-3 border border-[#126b8a]/15">
                {ai.reasoning}
              </p>

              {ai.signals.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">具體訊號</p>
                  <ul className="space-y-1">
                    {ai.signals.map((s, i) => (
                      <li key={i} className="text-xs text-slate-700 border-l-2 border-amber-400 bg-amber-50/40 pl-2 py-1">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">處置建議</p>
                <p className="text-xs text-slate-700 leading-relaxed bg-white/60 rounded p-2 border border-[#126b8a]/15">
                  {ai.recommendationReason}
                </p>
              </div>

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

function SeverityBadge({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: { label: '輕度可疑', cls: 'bg-yellow-100 text-yellow-700' },
    medium: { label: '中度可疑', cls: 'bg-orange-100 text-orange-700' },
    high: { label: '嚴重可疑', cls: 'bg-red-100 text-red-700' },
  }[severity];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.cls}`}>
      {styles.label}
    </span>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: 'reject' | 'review_more' | 'accept' }) {
  const styles = {
    reject: { label: '建議拒絕', cls: 'bg-red-100 text-red-700' },
    review_more: { label: '需查更多', cls: 'bg-amber-100 text-amber-700' },
    accept: { label: '可接受', cls: 'bg-green-100 text-green-700' },
  }[recommendation];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.cls}`}>
      → {styles.label}
    </span>
  );
}
