'use client';

import { useState } from 'react';
import {
  useAdminAppeals,
  useApproveAppeal,
  useDismissAppeal,
  AdminAppealRow,
} from '@/hooks/use-admin';

type StatusFilter = 'pending' | 'approved' | 'dismissed';

export default function AdminAppealsPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const { data: appeals = [], isLoading } = useAdminAppeals(status);
  const approve = useApproveAppeal();
  const dismiss = useDismissAppeal();
  const [target, setTarget] = useState<{ row: AdminAppealRow; action: 'approve' | 'dismiss' } | null>(null);
  const [note, setNote] = useState('');

  const handleSubmit = async () => {
    if (!target) return;
    try {
      if (target.action === 'approve') {
        await approve.mutateAsync({ id: target.row.id, adminNote: note.trim() || undefined });
      } else {
        if (note.trim().length < 5) {
          alert('駁回需附說明（至少 5 字）');
          return;
        }
        await dismiss.mutateAsync({ id: target.row.id, adminNote: note.trim() });
      }
      setTarget(null);
      setNote('');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? '處理失敗');
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">申訴管理</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {(['pending', 'approved', 'dismissed'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {s === 'pending' ? '待處理' : s === 'approved' ? '已通過' : '已駁回'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
      {!isLoading && appeals.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          目前沒有{status === 'pending' ? '待處理' : status === 'approved' ? '已通過' : '已駁回'}的申訴
        </p>
      )}

      <div className="space-y-3">
        {appeals.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{a.surveyTitle}</p>
                <p className="text-xs text-muted-foreground">
                  申訴於 {new Date(a.createdAt).toLocaleString('zh-TW')}
                  {a.qualityScore != null && ` · 品質分 ${a.qualityScore}`}
                  {a.rewardMode === 'lottery'
                    ? ` · 抽獎：${a.lotteryPrize ?? '未命名獎品'}`
                    : ` · 獎勵 NT$${a.rewardPoints}`}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                a.status === 'approved' ? 'bg-green-100 text-green-700' :
                a.status === 'dismissed' ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {a.status === 'pending' ? '待處理' : a.status === 'approved' ? '已通過' : '已駁回'}
              </span>
            </div>

            <div className="rounded bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">申訴理由</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.reason}</p>
            </div>

            {a.adminNote && (
              <div className="rounded bg-blue-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-1">管理員備註</p>
                <p className="text-sm text-slate-700">{a.adminNote}</p>
              </div>
            )}

            {a.status === 'pending' && (
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setTarget({ row: a, action: 'dismiss' }); setNote(''); }}
                  className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  駁回
                </button>
                <button
                  onClick={() => { setTarget({ row: a, action: 'approve' }); setNote(''); }}
                  className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  {a.rewardMode === 'lottery'
                    ? '✓ 通過（恢復抽獎資格 + 信譽分 +5）'
                    : '✓ 通過（補發獎勵 + 信譽分 +5）'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {target.action === 'approve' ? '通過申訴' : '駁回申訴'}
            </h3>
            <p className="mt-1 text-xs text-slate-500 truncate">{target.row.surveyTitle}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={target.action === 'approve' ? '備註（可選，留空也可）' : '請說明駁回原因（至少 5 字）'}
              rows={3}
              maxLength={500}
              className="mt-3 w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {target.action === 'approve' && (
              <p className="mt-1 text-[10px] text-slate-400">
                {target.row.rewardMode === 'lottery'
                  ? '通過後會恢復抽獎資格、加 5 點信譽分，且不補發固定現金獎勵'
                  : '通過後會自動補發獎勵、加 5 點信譽分、改判 response 為 rewarded'}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setTarget(null); setNote(''); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={approve.isPending || dismiss.isPending}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                  target.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {(approve.isPending || dismiss.isPending) ? '處理中…' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
