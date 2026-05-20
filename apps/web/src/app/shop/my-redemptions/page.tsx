'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMyRedemptions, useMarkRedemptionUsed, CATEGORY_LABEL, CATEGORY_BADGE } from '@/hooks/use-shop';

export default function MyRedemptionsPage() {
  const { data: redemptions = [], isLoading } = useMyRedemptions();
  const markUsed = useMarkRedemptionUsed();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMarkUsed = async (id: string) => {
    if (!confirm('標記為已使用？此動作無法復原。')) return;
    try {
      await markUsed.mutateAsync(id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '處理失敗');
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🎁 我的兌換</h1>
        <Link href="/shop" className="text-sm text-primary hover:underline">← 回商城</Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!isLoading && redemptions.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          您還沒有任何兌換紀錄
        </p>
      )}

      <div className="space-y-3">
        {redemptions.map((r) => {
          const isExpired = r.expiresAt ? new Date(r.expiresAt) < new Date() : false;
          const effectiveStatus = isExpired && r.status === 'issued' ? 'expired' : r.status;
          const isShown = revealed.has(r.id);
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{r.itemName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[r.itemCategory]}`}>
                      {CATEGORY_LABEL[r.itemCategory]}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      兌換於 {new Date(r.createdAt).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  effectiveStatus === 'used' ? 'bg-slate-100 text-slate-600' :
                  effectiveStatus === 'expired' ? 'bg-red-100 text-red-700' :
                  effectiveStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {effectiveStatus === 'issued' ? '可使用' :
                   effectiveStatus === 'used' ? '已使用' :
                   effectiveStatus === 'expired' ? '已過期' :
                   '已取消'}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">PIN 序號</p>
                {r.pinCode ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 font-mono text-sm text-slate-800 tracking-wider">
                      {isShown ? r.pinCode : r.pinCode.replace(/[0-9]/g, '•')}
                    </p>
                    <button
                      onClick={() => toggleReveal(r.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {isShown ? '隱藏' : '顯示'}
                    </button>
                    {isShown && (
                      <button
                        onClick={() => navigator.clipboard.writeText(r.pinCode!)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        複製
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700">⚠️ PIN 無法解密；請聯絡客服</p>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <div>
                  消費 {r.costPoints} 點 · 面額 NT${r.faceValue}
                  {r.expiresAt && (
                    <> · 有效至 {new Date(r.expiresAt).toLocaleDateString('zh-TW')}</>
                  )}
                </div>
                {effectiveStatus === 'issued' && (
                  <button
                    onClick={() => handleMarkUsed(r.id)}
                    className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    標記已使用
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
