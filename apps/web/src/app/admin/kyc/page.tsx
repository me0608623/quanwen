'use client';

import { useState } from 'react';
import { useAdminKycList, useApproveKyc, useRejectKyc, AdminKycRow } from '@/hooks/use-admin';

export default function AdminKycPage() {
  const { data: list = [], isLoading } = useAdminKycList();
  const approve = useApproveKyc();
  const reject = useRejectKyc();
  const [target, setTarget] = useState<{ row: AdminKycRow; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!target) return;
    try {
      if (target.action === 'approve') {
        await approve.mutateAsync({ id: target.row.id, adminNote: note.trim() || undefined });
      } else {
        if (note.trim().length < 5) {
          alert('駁回需附說明（至少 5 字）');
          return;
        }
        await reject.mutateAsync({ id: target.row.id, adminNote: note.trim() });
      }
      setTarget(null);
      setNote('');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? '處理失敗');
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KYC 身份驗證審核</h1>
        <p className="text-xs text-muted-foreground mt-1">
          受試者提領 ≥ NT$2,000 需通過 KYC。所有 PII 欄位以 AES-256-GCM 加密儲存，僅在此頁解密顯示。
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}
      {!isLoading && list.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          目前沒有待審 KYC
        </p>
      )}

      <div className="space-y-3">
        {list.map((row) => (
          <div key={row.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.realName ?? '(無法解密)'}</p>
                <p className="text-[11px] text-muted-foreground">
                  user_id: {row.userId.slice(0, 8)}… · 提交 {new Date(row.submittedAt).toLocaleString('zh-TW')}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                待審
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-3 text-xs">
              <div>
                <p className="text-[10px] uppercase text-slate-500">身分證號</p>
                <p className="font-mono text-slate-800">{row.idNumber ?? '(無)'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500">手機</p>
                <p className="font-mono text-slate-800">{row.phone ?? '(無)'}</p>
              </div>
            </div>

            {(row.idFrontUrl || row.idBackUrl || row.selfieUrl) && (
              <div className="flex gap-2 flex-wrap">
                {row.idFrontUrl && <a href={row.idFrontUrl} target="_blank" className="text-xs text-blue-600 hover:underline">身分證正面</a>}
                {row.idBackUrl && <a href={row.idBackUrl} target="_blank" className="text-xs text-blue-600 hover:underline">背面</a>}
                {row.selfieUrl && <a href={row.selfieUrl} target="_blank" className="text-xs text-blue-600 hover:underline">手持自拍</a>}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setTarget({ row, action: 'reject' }); setNote(''); }}
                className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                駁回
              </button>
              <button
                onClick={() => { setTarget({ row, action: 'approve' }); setNote(''); }}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
              >
                ✓ 通過
              </button>
            </div>
          </div>
        ))}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {target.action === 'approve' ? '通過 KYC' : '駁回 KYC'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{target.row.realName ?? target.row.userId}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={target.action === 'approve' ? '備註（可選）' : '請說明駁回原因（至少 5 字）'}
              rows={3}
              maxLength={500}
              className="mt-3 w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setTarget(null); setNote(''); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={approve.isPending || reject.isPending}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                  target.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {(approve.isPending || reject.isPending) ? '處理中…' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
