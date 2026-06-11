'use client';

import type { PricingAdvice } from '@/hooks/use-pricing';

interface Props {
  advice: PricingAdvice | undefined;
  loading: boolean;
  currentReward: number;
  onApplyPrice: (value: number) => void;
}

/** 問卷建立頁的「建議單份獎勵」卡（參考用；發問卷者自訂價）。 */
export function PricingAdviceCard({ advice, loading, currentReward, onApplyPrice }: Props) {
  if (loading && !advice) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        正在依題目估算建議獎勵…
      </div>
    );
  }
  if (!advice) return null;

  const { suggestedRange, totalSeconds } = advice;
  const fair = suggestedRange.fair;
  const minutes = Math.max(0.1, Math.round((totalSeconds / 60) * 10) / 10);
  const belowFair = fair > 0 && currentReward < fair;

  const options = [
    { label: '省錢', value: suggestedRange.economical },
    { label: '公平', value: fair },
    { label: '快速成案', value: suggestedRange.fast },
  ];

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>💡</span>
        <span>建議單份獎勵（參考）</span>
      </div>

      <p className="text-xs text-muted-foreground">
        預估填答約 <b className="text-foreground">{minutes}</b> 分鐘 → 建議公平價{' '}
        <b className="text-foreground">NT${fair}</b> / 份
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        {options.map((opt) => {
          const selected = currentReward === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onApplyPrice(opt.value)}
              aria-pressed={selected}
              className={`rounded-full px-2.5 py-1 border transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:border-primary/50 hover:bg-primary/5'
              }`}
            >
              {opt.label} NT${opt.value}
            </button>
          );
        })}
      </div>

      {belowFair && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          ⚠️ 目前 NT${currentReward} 低於建議公平價，預期完成率偏低、成案可能較慢。
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">{advice.note}</p>
    </div>
  );
}
