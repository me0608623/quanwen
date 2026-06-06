'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminImportAppeals, useResolveImportAppeal, useDismissImportAppeal } from '@/hooks/use-import-appeals';

export default function AdminImportAppealsPage() {
  const [status, setStatus] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
  const { data: appeals, isLoading } = useAdminImportAppeals(status);
  const resolve = useResolveImportAppeal();
  const dismiss = useDismissImportAppeal();

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">匯入失敗申訴</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">← 管理後台</Link>
      </div>

      <div className="flex gap-2 text-sm">
        {(['pending', 'resolved', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-md border px-3 py-1.5 ${status === s ? 'border-primary bg-primary/5 font-semibold' : 'border-border'}`}
          >
            {s === 'pending' ? '待處理' : s === 'resolved' ? '已處理' : '已駁回'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : !appeals?.length ? (
        <p className="text-sm text-muted-foreground">目前沒有{status === 'pending' ? '待處理' : ''}申訴。</p>
      ) : (
        <div className="space-y-3">
          {appeals.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{a.title || '（未填主題）'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.requesterEmail}</p>
                  <a href={a.surveyUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs text-primary hover:underline">
                    {a.surveyUrl} ↗
                  </a>
                  {a.note && <p className="mt-2 text-sm text-muted-foreground">{a.note}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleString('zh-TW')}</p>
                  {a.adminNote && <p className="mt-1 text-xs text-muted-foreground">管理員備註：{a.adminNote}</p>}
                </div>
              </div>

              {a.status === 'pending' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: a.id, createDraft: true })}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    幫他建立草稿並完成
                  </button>
                  <button
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: a.id, createDraft: false, adminNote: '已協助處理' })}
                    className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
                  >
                    僅標記完成
                  </button>
                  <button
                    disabled={dismiss.isPending}
                    onClick={() => {
                      const reason = prompt('駁回原因：');
                      if (reason && reason.trim().length >= 3) dismiss.mutate({ id: a.id, adminNote: reason.trim() });
                    }}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    駁回
                  </button>
                </div>
              )}
              {a.status === 'resolved' && a.resolvedSurveyId && (
                <p className="mt-2 text-xs text-emerald-700">已建立草稿（survey id: {a.resolvedSurveyId.slice(0, 8)}…）並通知申請者</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
