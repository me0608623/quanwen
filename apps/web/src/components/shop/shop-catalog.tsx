'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRedeem, useShopItems, CATEGORY_BADGE, CATEGORY_LABEL, type ShopItem } from '@/hooks/use-shop';
import { useWallet } from '@/hooks/use-wallet';

interface ShopCatalogProps {
  compact?: boolean;
  showHeader?: boolean;
  showMyRedemptionsLink?: boolean;
}

// 尚未取得官方圖片時的暫時版面（圖片之後補上）。依商店配色顯示面額。
const PLACEHOLDER_STYLE: Record<ShopItem['category'], { wrap: string; tag: string }> = {
  voucher_711: { wrap: 'from-green-500 to-orange-400', tag: '7-ELEVEN' },
  voucher_familymart: { wrap: 'from-sky-500 to-emerald-400', tag: 'FamilyMart 全家' },
  voucher_starbucks: { wrap: 'from-emerald-700 to-emerald-500', tag: 'Starbucks' },
  voucher_general: { wrap: 'from-slate-500 to-slate-400', tag: '通用禮券' },
  merchandise: { wrap: 'from-amber-500 to-yellow-400', tag: '商品' },
};

function VoucherPlaceholder({ category, faceValue }: { category: ShopItem['category']; faceValue: number }) {
  const s = PLACEHOLDER_STYLE[category];
  return (
    <div className={`flex aspect-square w-full flex-col items-center justify-center bg-gradient-to-br ${s.wrap} text-white`}>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-90">{s.tag}</span>
      <span className="mt-1 text-4xl font-extrabold tabular-nums">NT${faceValue}</span>
      <span className="mt-2 text-[10px] opacity-80">禮券圖片即將上架</span>
    </div>
  );
}

export function ShopCatalog({
  compact = false,
  showHeader = true,
  showMyRedemptionsLink = true,
}: ShopCatalogProps) {
  const { data: items = [], isLoading } = useShopItems();
  const { data: wallet } = useWallet();
  const redeem = useRedeem();
  const [confirming, setConfirming] = useState<ShopItem | null>(null);

  const pointsBalance = wallet?.pointsBalance ?? 0;

  const handleRedeem = async (item: ShopItem) => {
    try {
      await redeem.mutateAsync(item.id);
      setConfirming(null);
      alert('✅ 兌換成功！PIN 序號已寄到通知中心，可在「我的兌換」查看。');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '兌換失敗');
    }
  };

  return (
    <section className={compact ? 'space-y-4' : 'space-y-6'}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">🛒 積分商城</h2>
            <p className="mt-1 text-sm text-slate-500">完成問卷累積積分，在這裡直接換禮券。</p>
          </div>
          {showMyRedemptionsLink && (
            <Link href="/shop/my-redemptions" className="text-sm text-primary hover:underline">
              我的兌換 →
            </Link>
          )}
        </div>
      )}

      <div className="rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-50 to-yellow-50 p-4">
        <p className="text-xs uppercase tracking-wide text-amber-700">目前積分</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
          {pointsBalance.toLocaleString()} <span className="text-sm font-normal text-amber-700">點</span>
        </p>
        <p className="mt-1 text-[11px] text-amber-600">積分不足就先去填問卷，宇宙不會因為你按按鈕就送你點數。</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">載入商品中…</p>}

      {!isLoading && items.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          目前沒有可兌換的商品
        </p>
      )}

      <div className={`grid gap-3 ${compact ? 'xl:grid-cols-2' : 'sm:grid-cols-2'}`}>
        {items.map((item) => {
          const affordable = pointsBalance >= item.costPoints;
          return (
            <div key={item.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <div className="relative overflow-hidden rounded-md">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="aspect-square w-full bg-slate-50 object-contain"
                  />
                ) : (
                  <VoucherPlaceholder category={item.category} faceValue={item.faceValue} />
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[item.category]}`}>
                  {CATEGORY_LABEL[item.category]}
                </span>
              </div>
              {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tabular-nums text-amber-700">{item.costPoints}</span>
                <span className="text-xs text-slate-500">點</span>
                <span className="ml-auto text-[10px] text-slate-400">面額 NT${item.faceValue}</span>
              </div>
              <button
                onClick={() => setConfirming(item)}
                disabled={!affordable || redeem.isPending}
                className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {!affordable ? `差 ${item.costPoints - pointsBalance} 點` : '立即兌換'}
              </button>
            </div>
          );
        })}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">確認兌換</h3>
            <p className="mt-2 text-sm text-slate-700">{confirming.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              將從您的積分餘額扣除 <span className="font-bold text-amber-700">{confirming.costPoints}</span> 點。
            </p>
            <p className="mt-3 text-[11px] text-slate-400">兌換完成後 PIN 序號會立即發放，6 個月內有效。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={() => handleRedeem(confirming)}
                disabled={redeem.isPending}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {redeem.isPending ? '處理中…' : '確認兌換'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
