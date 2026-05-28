'use client';

/**
 * 評分 / 學術量表 共用渲染。
 * 一般評分:config.maxRating(預設 5),按 1..max。
 * 學術量表:config.scaleStart=0 → 從 0 起算(0~5);config.minLabel/maxLabel → 兩端錨點文字
 *   例:同意度「非常不同意 … 非常同意」、頻率「從來沒有 … 總是如此」。
 */
export interface RatingScaleConfig {
  maxRating?: number;
  scaleStart?: number; // 0 或 1(預設 1)
  minLabel?: string;
  maxLabel?: string;
}

/** 依 config 算出要顯示的分數陣列(scaleStart..maxRating) */
export function ratingScaleValues(config?: RatingScaleConfig): number[] {
  const rawMax = typeof config?.maxRating === 'number' ? config.maxRating : 5;
  const max = Math.max(2, Math.min(10, Math.round(rawMax)));
  const start = config?.scaleStart === 0 ? 0 : 1;
  const out: number[] = [];
  for (let v = start; v <= max; v += 1) out.push(v);
  return out;
}

export function RatingScale({
  config,
  value,
  onSelect,
  disabled = false,
}: {
  config?: RatingScaleConfig;
  value?: number | null;
  onSelect?: (v: number) => void;
  disabled?: boolean;
}) {
  const values = ratingScaleValues(config);
  const minLabel = config?.minLabel;
  const maxLabel = config?.maxLabel;
  const last = values[values.length - 1];

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(v)}
              className={[
                'h-10 w-10 rounded-full border text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-primary/60',
                disabled ? 'cursor-default' : '',
              ].join(' ')}
            >
              {v}
            </button>
          );
        })}
        {value != null && (
          <span className="ml-1 self-center text-xs text-muted-foreground">
            {value} / {last}
          </span>
        )}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}
