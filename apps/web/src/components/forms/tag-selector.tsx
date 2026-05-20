'use client';

import { InterestTag } from '@/hooks/use-profile';

const CATEGORY_LABELS: Record<string, string> = {
  tech: '科技/程式',
  lifestyle: '生活風格',
  finance: '投資/理財',
  health: '健康/醫療',
  entertainment: '娛樂/影音',
  food: '美食',
  travel: '旅遊',
  education: '學習/教育',
  society: '社會/時事',
  other: '其他',
};

interface TagSelectorProps {
  tags: InterestTag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  maxSelect?: number;
}

export function TagSelector({ tags, selected, onChange, maxSelect = 10 }: TagSelectorProps) {
  const byCategory = tags.reduce<Record<string, InterestTag[]>>((acc, tag) => {
    const cat = tag.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tag);
    return acc;
  }, {});

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < maxSelect) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        已選 {selected.length}/{maxSelect} 個標籤
      </p>
      {Object.entries(byCategory).map(([cat, catTags]) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[cat] ?? cat}
          </p>
          <div className="flex flex-wrap gap-2">
            {catTags.map((tag) => {
              const active = selected.includes(tag.id);
              const disabled = !active && selected.length >= maxSelect;
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(tag.id)}
                  className={[
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/60',
                    disabled ? 'cursor-not-allowed opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
