'use client';

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
          <label className="mb-1 block text-sm font-medium">最低信譽分（選填）</label>
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
