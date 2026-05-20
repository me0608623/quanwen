'use client';

import { SurveyQuestion, QuestionOption } from '@/hooks/use-surveys';

const TYPE_LABELS: Record<SurveyQuestion['type'], string> = {
  single_choice: '單選題',
  multiple_choice: '多選題',
  text: '開放式文字',
  rating: '評分題',
  matrix: '矩陣題',
};

const TYPES_WITH_OPTIONS: SurveyQuestion['type'][] = ['single_choice', 'multiple_choice'];

interface QuestionEditorProps {
  question: SurveyQuestion;
  index: number;
  onChange: (q: SurveyQuestion) => void;
  onRemove: () => void;
  /** Phase 5.2: 其他可作為 reverse pair 的 rating 題（用於下拉選單） */
  ratingSiblings?: Array<{ index: number; title: string }>;
}

export function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
  ratingSiblings = [],
}: QuestionEditorProps) {
  const updateField = <K extends keyof SurveyQuestion>(key: K, value: SurveyQuestion[K]) =>
    onChange({ ...question, [key]: value });

  const updateOption = (i: number, label: string) => {
    const options = (question.options ?? []).map((o, idx) =>
      idx === i ? { ...o, label } : o,
    );
    onChange({ ...question, options });
  };

  const addOption = () => {
    const options = [
      ...(question.options ?? []),
      { label: '', sortOrder: (question.options?.length ?? 0) },
    ];
    onChange({ ...question, options });
  };

  const removeOption = (i: number) => {
    const options = (question.options ?? []).filter((_, idx) => idx !== i);
    onChange({ ...question, options });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
        <select
          value={question.type}
          onChange={(e) => updateField('type', e.target.value as SurveyQuestion['type'])}
          className="rounded border border-input bg-background px-2 py-1 text-xs"
        >
          {(Object.keys(TYPE_LABELS) as SurveyQuestion['type'][]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={question.isRequired}
            onChange={(e) => updateField('isRequired', e.target.checked)}
            className="h-3 w-3"
          />
          必填
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-destructive hover:underline"
        >
          刪除
        </button>
      </div>

      {/* Title */}
      <input
        type="text"
        value={question.title}
        onChange={(e) => updateField('title', e.target.value)}
        placeholder="輸入題目文字…"
        className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {/* Options */}
      {TYPES_WITH_OPTIONS.includes(question.type) && (
        <div className="space-y-2 pl-2">
          {(question.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <input
                type="text"
                value={opt.label}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`選項 ${i + 1}`}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="text-xs text-primary hover:underline"
          >
            + 新增選項
          </button>
        </div>
      )}

      {/* Rating config */}
      {question.type === 'rating' && (
        <div className="space-y-2 pl-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">最高分：</span>
            <input
              type="number"
              min={2}
              max={10}
              value={(question.config?.maxRating as number) ?? 5}
              onChange={(e) =>
                onChange({ ...question, config: { ...question.config, maxRating: Number(e.target.value) } })
              }
              className="w-16 rounded border border-input bg-background px-2 py-1 text-sm"
            />
          </div>

          {/* Phase 5.2: 反向題綁定 */}
          {ratingSiblings.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-amber-700">🔁 反向題對：</span>
              <select
                value={(question.config?.reverseOfIndex as number | undefined) ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const next = { ...(question.config ?? {}) };
                  if (val === '') {
                    delete (next as Record<string, unknown>).reverseOfIndex;
                  } else {
                    (next as Record<string, unknown>).reverseOfIndex = Number(val);
                  }
                  onChange({ ...question, config: next });
                }}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs"
              >
                <option value="">無（不綁定）</option>
                {ratingSiblings.map((s) => (
                  <option key={s.index} value={s.index}>
                    Q{s.index + 1}{s.title ? `：${s.title.slice(0, 20)}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500">
                若選擇，後台會比對兩題分數加總（正反互補一致性）
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
