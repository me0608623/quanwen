'use client';

import { useState } from 'react';
import type { AudienceCriteria } from '@/hooks/use-surveys';
import {
  INDUSTRY_OPTIONS,
  AGE_RANGE_OPTIONS,
  GENDER_OPTIONS,
  REGION_OPTIONS,
  EMPLOYMENT_OPTIONS,
  EDUCATION_OPTIONS,
  type Option,
} from '@/lib/profile-options';

// audienceCriteria 中所有「字串陣列」型別的維度（排除 minReputationScore / tag 相關）
type ArrayField = 'industry' | 'ageRange' | 'gender' | 'region' | 'occupation' | 'education';

const FIELDS: { field: ArrayField; label: string; options: Option[] }[] = [
  { field: 'industry', label: '行業 / 職業類別', options: INDUSTRY_OPTIONS },
  { field: 'occupation', label: '就業狀態', options: EMPLOYMENT_OPTIONS },
  { field: 'ageRange', label: '年齡層', options: AGE_RANGE_OPTIONS },
  { field: 'gender', label: '性別', options: GENDER_OPTIONS },
  { field: 'education', label: '學歷', options: EDUCATION_OPTIONS },
  { field: 'region', label: '居住縣市', options: REGION_OPTIONS },
];

interface Props {
  value: AudienceCriteria;
  onChange: (next: AudienceCriteria) => void;
  /** 是否顯示「最低信譽分」欄（詳情頁另有獨立 slider，故可關閉） */
  showReputation?: boolean;
  /** 已上架等不可編輯狀態時鎖定互動 */
  disabled?: boolean;
}

export function AudienceTargeting({ value, onChange, showReputation = true, disabled = false }: Props) {
  // 切換某個維度裡的一個選項（不可變更新）
  const toggle = (field: ArrayField, optionValue: string) => {
    const current = value[field] ?? [];
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    const draft: AudienceCriteria = { ...value, [field]: next };
    if (next.length === 0) delete draft[field]; // 空陣列 = 不限，直接移除
    onChange(draft);
  };

  const setMinReputation = (raw: string) => {
    const draft: AudienceCriteria = { ...value };
    const n = Number(raw);
    if (!raw || Number.isNaN(n) || n <= 0) {
      delete draft.minReputationScore;
    } else {
      draft.minReputationScore = Math.min(100, Math.max(0, Math.trunc(n)));
    }
    onChange(draft);
  };

  const totalSelected = FIELDS.reduce((sum, f) => sum + (value[f.field]?.length ?? 0), 0);

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          受眾鎖定（選填）
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          只讓符合條件的受試者在任務市場看到這份問卷。同一維度多選為「任一即可」，不同維度之間需「全部符合」。
          全部留空 = 不限，所有人都看得到。
        </p>
      </div>

      {FIELDS.map(({ field, label, options }) => {
        const selected = value[field] ?? [];
        return (
          <div key={field}>
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-sm font-medium">{label}</label>
              {selected.length > 0 ? (
                <span className="text-xs text-primary">已選 {selected.length}</span>
              ) : (
                <span className="text-xs text-muted-foreground">不限</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {/* 「全部」chip — 按下去把此維度所有選項全選；再按一次取消全選（= 不限） */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const draft = { ...value };
                  if (selected.length === options.length) {
                    delete draft[field]; // 已全選 → 再按一次取消（= 不限）
                  } else {
                    draft[field] = options.map((o) => o.value); // 全選所有選項
                  }
                  onChange(draft);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected.length === options.length || selected.length === 0
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/50'
                }`}
              >
                全部
              </button>
              {options.map((o) => {
                const active = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(field, o.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {showReputation && (
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label className="block text-sm font-medium">最低信譽分（選填）</label>
            <ReputationInfoIcon />
          </div>
          <input
            type="number"
            min={0}
            max={100}
            disabled={disabled}
            value={value.minReputationScore ?? ''}
            onChange={(e) => setMinReputation(e.target.value)}
            placeholder="不限"
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            只讓信譽分 ≥ 此值的受試者填寫（0–100，預設新用戶 60）。
          </p>
        </div>
      )}

      {totalSelected === 0 && (!showReputation || (value.minReputationScore ?? 0) === 0) && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          目前未設任何條件 — 這份問卷會開放給所有受試者。
        </p>
      )}
    </section>
  );
}

/** 信譽分計算說明：小 ⓘ icon，點擊/hover 展開浮窗（規則對齊後端 ReputationService 調整點） */
export function ReputationInfoIcon() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="信譽分如何計算？"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-left shadow-lg"
        >
          <p className="text-xs font-semibold text-foreground">信譽分如何計算？</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>• 每位填答者從 <b className="text-foreground">60 分</b>起算，範圍 0–100</li>
            <li>• 填答通過品質審核：<b className="text-emerald-600">+1</b> / 份</li>
            <li>• 填答未通過審核（亂答、機器人特徵）：<b className="text-red-600">−5</b></li>
            <li>• 互惠問卷：通過 <b className="text-emerald-600">+1</b>、未通過 <b className="text-red-600">−3</b>、互評星等也會加減分</li>
            <li>• 申訴成功：補回 <b className="text-emerald-600">+5</b></li>
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            門檻設越高，樣本品質越好、但觸及人數越少。建議 60–70。
          </p>
        </div>
      )}
    </span>
  );
}
