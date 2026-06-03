'use client';

import { useState } from 'react';
import { useInterveneLotteryIssue, useLotteryObligations, useVerifyLotteryFulfillment } from '@/hooks/use-admin';

const STATUS_LABELS: Record<string, string> = {
  pending: '待建立者通知',
  notified: '待平台核驗',
  verified: '已完成核驗',
};

const RECIPIENT_LABELS: Record<string, string> = {
  awaiting_delivery: '等待中獎者確認',
  received: '中獎者已確認收到',
  issue_reported: '中獎者回報問題',
};

export default function AdminLotteryPage() {
  const { data: obligations = [], isLoading } = useLotteryObligations();
  const verify = useVerifyLotteryFulfillment();
  const intervene = useInterveneLotteryIssue();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [interventionNotes, setInterventionNotes] = useState<Record<string, string>>({});
  const issueCount = obligations.filter((item) => item.recipientStatus === 'issue_reported').length;
  const overdueCount = obligations.filter((item) => item.isOverdue).length;
  const pendingCount = obligations.filter((item) => !item.platformVerifiedAt).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">平台保證人</p>
        <h1 className="mt-1 text-2xl font-bold">抽獎履約稽核</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          平台保留開獎、建立者通知、中獎者確認與核驗紀錄。逾期或回報問題的案件會列入保證追蹤，優先聯繫問卷建立者並留下介入紀錄。
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">中獎者回報問題</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{issueCount}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-700">逾期案件</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{overdueCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">尚待平台核驗</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{pendingCount}</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
      {!isLoading && obligations.length === 0 && <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">目前沒有抽獎履約案件</p>}

      <div className="space-y-3">
        {obligations.map((item) => (
          <section key={item.id} className={`rounded-xl border p-4 ${item.isOverdue ? 'border-red-300 bg-red-50' : 'border-border bg-card'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.surveyTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">獎品：{item.prize}</p>
                <p className="mt-1 text-xs text-slate-500">
                  履約期限：{new Date(item.fulfillmentDueAt).toLocaleString('zh-TW')}
                  {item.isOverdue && <span className="ml-2 font-bold text-red-700">已逾期</span>}
                </p>
                <p className={`mt-1 text-xs font-semibold ${item.lotteryTermsAcceptedAt ? 'text-emerald-700' : 'text-red-700'}`}>
                  建立者履約承諾：{item.lotteryTermsAcceptedAt ? new Date(item.lotteryTermsAcceptedAt).toLocaleString('zh-TW') : '缺少同意紀錄'}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {STATUS_LABELS[item.fulfillmentStatus] ?? item.fulfillmentStatus}
              </span>
            </div>
            {(item.recipientStatus === 'issue_reported' || item.isOverdue) && (
              <p className="mt-3 inline-flex rounded-full bg-red-700 px-2 py-1 text-xs font-bold text-white">
                優先處理
              </p>
            )}
            {item.fulfillmentNote && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-700">
                建立者兌獎說明：{item.fulfillmentNote}
              </p>
            )}
            <p className={`mt-3 text-xs font-semibold ${item.recipientStatus === 'issue_reported' ? 'text-red-700' : 'text-slate-600'}`}>
              中獎者狀態：{RECIPIENT_LABELS[item.recipientStatus] ?? item.recipientStatus}
            </p>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <p className={`rounded-lg border px-3 py-2 font-semibold ${item.creatorObligationNotifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                建立者義務通知：{item.creatorObligationNotifiedAt ? '已送達' : '等待系統補送'}
              </p>
              <p className={`rounded-lg border px-3 py-2 font-semibold ${item.drawNotifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                中獎結果通知：{item.drawNotifiedAt ? '已送達' : '等待系統補送'}
              </p>
              {item.fulfillmentStatus !== 'pending' && (
                <p className={`rounded-lg border px-3 py-2 font-semibold ${item.fulfillmentNotifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  兌獎說明通知：{item.fulfillmentNotifiedAt ? '已送達' : '等待系統補送'}
                </p>
              )}
              {item.platformVerifiedAt && (
                <p className={`rounded-lg border px-3 py-2 font-semibold ${item.platformVerifiedNotifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  核驗結果通知：{item.platformVerifiedNotifiedAt ? '已送達雙方' : '等待系統補送'}
                </p>
              )}
              {item.recipientConfirmedAt && (
                <p className={`rounded-lg border px-3 py-2 font-semibold ${item.recipientConfirmedNotifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  收件確認通報：{item.recipientConfirmedNotifiedAt ? '已送達建立者與平台' : '等待系統補送'}
                </p>
              )}
            </div>
            {item.recipientIssueNote && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                中獎者回報：{item.recipientIssueNote}
                <span className="mt-1 block text-xs font-semibold text-red-700">
                  爭議通報：{item.recipientIssueNotifiedAt ? '已送達建立者與平台' : '等待系統補送'}
                </span>
              </p>
            )}
            {item.platformInterventionNote && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">平台介入歷程</p>
                <div className="mt-2 space-y-2">
                  {(item.platformInterventionHistory.length > 0
                    ? item.platformInterventionHistory
                    : [{ intervenedAt: item.platformIntervenedAt, note: item.platformInterventionNote, reason: 'winner_issue' as const }]
                  ).map((entry, index) => (
                    <p key={`${entry.intervenedAt}-${index}`} className="whitespace-pre-wrap rounded-md bg-white/70 p-2">
                      {entry.note}
                      <span className="mt-1 block text-xs text-amber-700">
                        {entry.reason === 'fulfillment_overdue' ? '平台逾期主動介入' : '中獎者問題回報'}
                        {entry.intervenedAt ? ` · ${new Date(entry.intervenedAt).toLocaleString('zh-TW')}` : ''}
                      </span>
                    </p>
                  ))}
                </div>
                <span className="mt-1 block text-xs font-semibold text-amber-800">
                  介入說明通知：{item.platformInterventionNotifiedAt ? '已送達雙方' : '等待系統補送'}
                </span>
              </div>
            )}
            {item.drawSeed && item.eligibleDigest && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                <p className={`font-semibold ${item.drawAuditVerified ? 'text-emerald-700' : 'text-red-700'}`}>
                  可重播抽獎稽核證明 · {item.drawAuditVerified ? '核對通過' : '核對異常'}
                </p>
                <p className="mt-1 break-all font-mono">候選摘要：{item.eligibleDigest}</p>
                <p className="mt-1 break-all font-mono">抽獎種子：{item.drawSeed}</p>
              </div>
            )}
            {(item.recipientStatus === 'issue_reported' || item.isOverdue) && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={interventionNotes[item.id] ?? ''}
                  onChange={(event) => setInterventionNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="平台介入處理說明（至少 5 字）"
                  className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={intervene.isPending || (interventionNotes[item.id]?.trim().length ?? 0) < 5}
                  onClick={() => intervene.mutate({ id: item.id, adminNote: interventionNotes[item.id] })}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  留存平台介入紀錄
                </button>
              </div>
            )}
            {item.fulfillmentStatus === 'notified' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={notes[item.id] ?? ''}
                  onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="平台核驗備註（選填）"
                  className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={verify.isPending || item.recipientStatus !== 'received'}
                  onClick={() => verify.mutate({ id: item.id, adminNote: notes[item.id] })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {item.recipientStatus === 'received' ? '核驗已履約' : '等待中獎者確認'}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
