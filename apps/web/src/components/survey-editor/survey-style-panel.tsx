'use client';

import type { SurveyTheme } from '@/hooks/use-surveys';
import { cn } from '@/lib/utils';

// 預設值（與填答頁/預覽的 fallback 一致）
export const DEFAULT_ACCENT = '#126b8a';
export const DEFAULT_BACKGROUND = '#ffffff';

const ACCENT_PRESETS = ['#126b8a', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0f172a'];
const BACKGROUND_PRESETS = ['#ffffff', '#f8fafc', '#fffbeb', '#f0fdf4', '#eff6ff', '#faf5ff'];

const FONT_OPTIONS: Array<{ id: NonNullable<SurveyTheme['fontFamily']>; label: string; sample: string }> = [
  { id: 'sans', label: '無襯線', sample: 'font-sans' },
  { id: 'serif', label: '襯線', sample: 'font-serif' },
  { id: 'rounded', label: '圓體', sample: 'font-sans' },
];

// 一鍵預設主題：組合主色 + 背景 + 字型
const THEME_PRESETS: Array<{ name: string; theme: SurveyTheme }> = [
  { name: '經典', theme: { accentColor: '#126b8a', backgroundColor: '#ffffff', fontFamily: 'sans' } },
  { name: '海洋', theme: { accentColor: '#2563eb', backgroundColor: '#eff6ff', fontFamily: 'sans' } },
  { name: '森林', theme: { accentColor: '#16a34a', backgroundColor: '#f0fdf4', fontFamily: 'sans' } },
  { name: '夕陽', theme: { accentColor: '#ea580c', backgroundColor: '#fffbeb', fontFamily: 'rounded' } },
  { name: '葡萄', theme: { accentColor: '#7c3aed', backgroundColor: '#faf5ff', fontFamily: 'serif' } },
  { name: '暗夜', theme: { accentColor: '#0f172a', backgroundColor: '#f8fafc', fontFamily: 'serif' } },
];

interface Props {
  value: SurveyTheme | null | undefined;
  onChange: (next: SurveyTheme) => void;
  disabled?: boolean;
}

export function SurveyStylePanel({ value, onChange, disabled }: Props) {
  const theme = value ?? {};
  const accent = theme.accentColor ?? DEFAULT_ACCENT;
  const background = theme.backgroundColor ?? DEFAULT_BACKGROUND;
  const font = theme.fontFamily ?? 'sans';

  const patch = (next: Partial<SurveyTheme>) => onChange({ ...theme, ...next });

  const matchesPreset = (p: SurveyTheme) =>
    (p.accentColor ?? '').toLowerCase() === accent.toLowerCase() &&
    (p.backgroundColor ?? '').toLowerCase() === background.toLowerCase() &&
    (p.fontFamily ?? 'sans') === font;

  return (
    <div className="space-y-5 p-3">
      {/* 一鍵預設主題 */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          預設主題
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...p.theme })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-2 transition-colors disabled:opacity-50',
                matchesPreset(p.theme) ? 'border-primary ring-1 ring-primary/40' : 'border-input hover:bg-muted',
              )}
            >
              <span
                className="h-6 w-full rounded"
                style={{ backgroundColor: p.theme.backgroundColor }}
              >
                <span
                  className="ml-1 mt-1 inline-block h-3 w-3 rounded-full align-top"
                  style={{ backgroundColor: p.theme.accentColor }}
                />
              </span>
              <span className="text-[11px] text-muted-foreground">{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 主色 */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          主色（按鈕 / 選中 / 進度條）
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => patch({ accentColor: c })}
              className={cn(
                'h-7 w-7 rounded-full border transition-transform hover:scale-110 disabled:opacity-50',
                accent.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-slate-400' : 'border-slate-200',
              )}
              style={{ background: c }}
              aria-label={`主色 ${c}`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={accent}
            disabled={disabled}
            onChange={(e) => patch({ accentColor: e.target.value })}
            className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent disabled:opacity-50"
          />
          <span className="text-xs text-muted-foreground">{accent}</span>
        </div>
      </section>

      {/* 背景色 */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          背景色
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {BACKGROUND_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => patch({ backgroundColor: c })}
              className={cn(
                'h-7 w-7 rounded-full border transition-transform hover:scale-110 disabled:opacity-50',
                background.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-slate-400' : 'border-slate-200',
              )}
              style={{ background: c }}
              aria-label={`背景色 ${c}`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            value={background}
            disabled={disabled}
            onChange={(e) => patch({ backgroundColor: e.target.value })}
            className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent disabled:opacity-50"
          />
          <span className="text-xs text-muted-foreground">{background}</span>
        </div>
      </section>

      {/* 字型 */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          字型
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => patch({ fontFamily: f.id })}
              className={cn(
                'rounded-md border py-2 text-xs transition-colors disabled:opacity-50',
                f.sample,
                font === f.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* 重設 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({})}
        className="w-full rounded-md border border-border py-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        重設為預設樣式
      </button>
    </div>
  );
}

// fontFamily key → Tailwind class（填答頁/預覽共用）
export function fontFamilyClass(font: SurveyTheme['fontFamily'] | undefined): string {
  switch (font) {
    case 'serif':
      return 'font-serif';
    case 'rounded':
    case 'sans':
    default:
      return 'font-sans';
  }
}
