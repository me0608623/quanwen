'use client';

import { DEADLINE_TIER_OPTIONS, type DeadlineTier } from '@/hooks/use-surveys';
import type { PricingAdvice } from '@/hooks/use-pricing';
import { PricingAdviceCard } from './pricing-advice-card';

interface RewardsPanelProps {
  /** 是否為互惠問卷（互惠無金錢獎勵與加急） */
  isMutual?: boolean;
  /** 每份基準獎勵（NT$，加急倍率前的原始值） */
  rewardPoints: number;
  targetCount: number;
  deadlineTier: DeadlineTier;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string;
  lotteryWinnerCount?: number;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual';
  lotteryDrawAt?: string;
  lotteryTermsAccepted?: boolean;
  onRewardChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onTierChange: (v: DeadlineTier) => void;
  onRewardModeChange?: (v: 'fixed' | 'lottery') => void;
  onLotteryPrizeChange?: (v: string) => void;
  onLotteryWinnerCountChange?: (v: number) => void;
  onLotteryDrawModeChange?: (v: 'when_full' | 'scheduled' | 'manual') => void;
  onLotteryDrawAtChange?: (v: string) => void;
  onLotteryTermsAcceptedChange?: (v: boolean) => void;
  /** AI 定價顧問（依題目估算建議獎勵） */
  pricingAdvice?: PricingAdvice;
  pricingLoading?: boolean;
  disabled?: boolean;
}

const RUSH_TIERS = DEADLINE_TIER_OPTIONS.filter((o) => o.value !== 'standard');
const LOTTERY_PRIZE_EXAMPLES = [
  '饗食天堂平日晚餐券 2 張',
  '星巴克飲料券 10 份',
  '超商禮券 NT$500',
];

const tierMultiplier = (tier: DeadlineTier) =>
  DEADLINE_TIER_OPTIONS.find((o) => o.value === tier)?.multiplier ?? 1;

export function RewardsPanel({
  isMutual,
  rewardPoints,
  targetCount,
  deadlineTier,
  rewardMode = 'fixed',
  lotteryPrize = '',
  lotteryWinnerCount = 1,
  lotteryDrawMode = 'when_full',
  lotteryDrawAt = '',
  lotteryTermsAccepted = false,
  onRewardChange,
  onTargetChange,
  onTierChange,
  onRewardModeChange,
  onLotteryPrizeChange,
  onLotteryWinnerCountChange,
  onLotteryDrawModeChange,
  onLotteryDrawAtChange,
  onLotteryTermsAcceptedChange,
  pricingAdvice,
  pricingLoading,
  disabled,
}: RewardsPanelProps) {
  if (isMutual) {
    return (
      <div className="p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          問卷獎勵設定
        </h3>
        <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          互惠問卷沒有金錢獎勵與加急推廣 — 系統會自動配對另一個有互惠問卷的人互填。
        </p>
      </div>
    );
  }

  if (rewardMode === 'lottery') {
    return (
      <div className="space-y-4 p-3">
        <RewardModeSelector value={rewardMode} disabled={disabled} onChange={onRewardModeChange} />
        <div>
          <label className="mb-1 block text-xs font-medium">抽獎獎品 *</label>
          <input
            value={lotteryPrize}
            disabled={disabled}
            onChange={(event) => onLotteryPrizeChange?.(event.target.value)}
            placeholder="例如：饗食天堂平日晚餐券"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LOTTERY_PRIZE_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => onLotteryPrizeChange?.(example)}
                  className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium">中獎名額 *</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={lotteryWinnerCount}
              disabled={disabled}
              onChange={(event) => onLotteryWinnerCountChange?.(Number(event.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">目標收集份數</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={targetCount}
              disabled={disabled}
              onChange={(event) => onTargetChange(Number(event.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">開獎方式 *</label>
          <select
            value={lotteryDrawMode}
            disabled={disabled}
            onChange={(event) => onLotteryDrawModeChange?.(event.target.value as typeof lotteryDrawMode)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="when_full">問卷收滿後自動開獎並通知</option>
            <option value="scheduled">指定日期自動開獎並通知</option>
            <option value="manual">問卷收滿後，由我手動開獎並通知</option>
          </select>
        </div>
        {lotteryDrawMode === 'scheduled' && (
          <div>
            <label className="mb-1 block text-xs font-medium">指定開獎日期 *</label>
            <input
              type="datetime-local"
              value={lotteryDrawAt}
              disabled={disabled}
              onChange={(event) => onLotteryDrawAtChange?.(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        )}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <p className="font-bold">抽獎回報系統會自動處理：</p>
          <ul className="mt-1.5 space-y-1">
            <li>有效填答者會先收到抽獎資格通知，開獎後會收到「中獎 / 未中獎」系統通知。</li>
            <li>若問卷提前截止，會依截止時的有效資格名單開獎；手動開獎時由你在收滿後通知。</li>
            <li>建立者必須於開獎後七日內交付獎品，平台會保留通知與履約核驗紀錄。</li>
          </ul>
        </div>
        <label className="flex items-start gap-2 text-xs leading-relaxed">
          <input
            type="checkbox"
            checked={lotteryTermsAccepted}
            disabled={disabled}
            onChange={(event) => onLotteryTermsAcceptedChange?.(event.target.checked)}
            className="mt-0.5"
          />
          <span>我同意於開獎後七日內交付獎品，接受平台留存通知、介入未收到案件並進行履約核驗。</span>
        </label>
      </div>
    );
  }

  const rushing = deadlineTier !== 'standard';
  const toggleRush = () => onTierChange(rushing ? 'standard' : 'express');

  const effectivePerShare = Math.round(rewardPoints * tierMultiplier(deadlineTier));
  const totalBudget = effectivePerShare * targetCount;

  return (
    <div className="space-y-5 p-3">
      <RewardModeSelector value={rewardMode} disabled={disabled} onChange={onRewardModeChange} />
      {/* 獎勵 */}
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          問卷獎勵設定
        </h3>
        <label className="mb-1 block text-xs font-medium">每份獎勵（NT$）</label>
        <input
          type="number"
          min={0}
          max={1000}
          value={rewardPoints}
          disabled={disabled}
          onChange={(e) => onRewardChange(Number(e.target.value))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
        {rewardPoints === 0 && (
          <p className="mt-1 text-[11px] text-amber-600">尚未設定獎勵，受試者較無誘因填答。建議參考下方建議價。</p>
        )}
        <label className="mb-1 mt-3 block text-xs font-medium">目標收集份數</label>
        <input
          type="number"
          min={1}
          max={10000}
          value={targetCount}
          disabled={disabled}
          onChange={(e) => onTargetChange(Number(e.target.value))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
        <div className="mt-3">
          <PricingAdviceCard
            advice={pricingAdvice}
            loading={!!pricingLoading}
            currentReward={rewardPoints}
            onApplyFair={onRewardChange}
          />
        </div>
      </div>

      {/* 加急推廣 */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            加急推廣
          </h3>
          <button
            type="button"
            role="switch"
            aria-checked={rushing}
            aria-label="加急推廣"
            disabled={disabled}
            onClick={toggleRush}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              rushing ? 'bg-primary' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                rushing ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          開啟後縮短交付期限、自動提高每份獎勵，讓問卷更快推送給受試者、增加曝光。
        </p>

        {!rushing ? (
          <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            標準交付（14 天）· 基準費率，不加價
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {RUSH_TIERS.map((opt) => {
              const eff = Math.round(rewardPoints * opt.multiplier);
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTierChange(opt.value)}
                  className={`w-full rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors disabled:opacity-60 ${
                    deadlineTier === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-muted-foreground">{opt.hint}</span>
                  </div>
                  {rewardPoints > 0 && (
                    <div className="mt-1 font-medium text-primary">實付 NT${eff}/份</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 預估總預算 */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-foreground">預估總預算</span>
          <span className="text-lg font-bold text-primary">NT${totalBudget.toLocaleString()}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          每份實付 NT${effectivePerShare.toLocaleString()}
          {rushing ? `（含加急 ${tierMultiplier(deadlineTier)}x）` : ''} × {targetCount.toLocaleString()} 份
        </p>
      </div>
    </div>
  );
}

function RewardModeSelector({
  value,
  disabled,
  onChange,
}: {
  value: 'fixed' | 'lottery';
  disabled?: boolean;
  onChange?: (value: 'fixed' | 'lottery') => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        問卷回饋設定
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {([
          ['fixed', '固定回饋'],
          ['lottery', '抽獎回饋'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(mode)}
            className={`rounded-md border px-2 py-2 text-xs font-semibold disabled:opacity-60 ${
              value === mode ? 'border-primary bg-primary/5 text-primary' : 'border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
