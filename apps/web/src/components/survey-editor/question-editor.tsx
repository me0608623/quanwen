'use client';

import { useMemo, useState } from 'react';
import { SurveyQuestion } from '@/hooks/use-surveys';

type DisplayQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'rating'
  | 'numeric'
  | 'yes_no'
  | 'dropdown';

const TYPE_LABELS: Record<DisplayQuestionType, string> = {
  single_choice: '單選',
  multiple_choice: '多選',
  text: '問答',
  rating: '評分',
  numeric: '數字',
  yes_no: '是/否',
  dropdown: '下拉選單',
};

interface SkipLogicRule {
  selectedOptionId?: string;
  selectedRating?: number;
  skipToQuestionIndex?: number;
  skipToEnd?: boolean;
}

interface QuestionEditorProps {
  question: SurveyQuestion;
  index: number;
  onChange: (q: SurveyQuestion) => void;
  onRemove: () => void;
  ratingSiblings?: Array<{ index: number; title: string }>;
  jumpTargets?: Array<{ index: number; title: string }>;
}

type ActiveTab = 'content' | 'logic';

export function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
  ratingSiblings = [],
  jumpTargets = [],
}: QuestionEditorProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('content');
  const displayType = useMemo<DisplayQuestionType>(() => {
    if (question.type === 'text' && question.config?.inputType === 'numeric') return 'numeric';
    if (question.type === 'single_choice' && question.config?.variant === 'yes_no') return 'yes_no';
    if (question.type === 'single_choice' && question.config?.renderAs === 'dropdown') return 'dropdown';
    return question.type as DisplayQuestionType;
  }, [question.type, question.config]);

  const rules = useMemo(() => {
    const raw = question.config?.skipLogic as SkipLogicRule[] | undefined;
    return Array.isArray(raw) ? raw : [];
  }, [question.config]);

  const updateField = <K extends keyof SurveyQuestion>(key: K, value: SurveyQuestion[K]) =>
    onChange({ ...question, [key]: value });

  const patchConfig = (nextConfig: Record<string, unknown>) => {
    onChange({ ...question, config: nextConfig });
  };

  const updateSkipLogic = (nextRules: SkipLogicRule[]) => {
    const nextConfig = { ...(question.config ?? {}) } as Record<string, unknown>;
    if (nextRules.length === 0) {
      delete nextConfig.skipLogic;
    } else {
      nextConfig.skipLogic = nextRules;
    }
    patchConfig(nextConfig);
  };

  const updateOption = (i: number, label: string) => {
    const options = (question.options ?? []).map((o, idx) => (idx === i ? { ...o, label } : o));
    onChange({ ...question, options });
  };

  const addOption = () => {
    const options = [...(question.options ?? []), { id: crypto.randomUUID(), label: '', sortOrder: question.options?.length ?? 0 }];
    onChange({ ...question, options });
  };

  const removeOption = (i: number) => {
    const options = (question.options ?? []).filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, sortOrder: idx }));
    onChange({ ...question, options });
  };
  const isChoiceType = displayType === 'single_choice' || displayType === 'multiple_choice' || displayType === 'yes_no' || displayType === 'dropdown';
  const isRatingLike = displayType === 'rating';
  const isNumeric = displayType === 'numeric';

  const addRule = () => {
    const next: SkipLogicRule = {};
    if (isChoiceType) {
      const firstOption = question.options?.[0];
      next.selectedOptionId = firstOption?.id ?? `option-${0}`;
    } else if (isRatingLike) {
      next.selectedRating = 3;
    } else {
      return;
    }
    updateSkipLogic([...rules, next]);
  };

  const updateRule = (ruleIndex: number, patch: Partial<SkipLogicRule>) => {
    const next = rules.map((rule, idx) => (idx === ruleIndex ? { ...rule, ...patch } : rule));
    updateSkipLogic(next);
  };

  const removeRule = (ruleIndex: number) => {
    updateSkipLogic(rules.filter((_, idx) => idx !== ruleIndex));
  };

  const optionItems = (question.options ?? []).map((option, optionIndex) => ({
    value: option.id ?? `option-${optionIndex}`,
    label: option.label || `選項 ${optionIndex + 1}`,
  }));

  const applyDisplayType = (nextType: DisplayQuestionType) => {
    const baseConfig = { ...(question.config ?? {}) } as Record<string, unknown>;
    delete baseConfig.variant;
    delete baseConfig.renderAs;
    delete baseConfig.inputType;

    if (nextType === 'numeric') {
      onChange({
        ...question,
        type: 'text',
        options: undefined,
        config: { ...baseConfig, inputType: 'numeric' },
      });
      return;
    }
    if (nextType === 'yes_no') {
      onChange({
        ...question,
        type: 'single_choice',
        options: [
          { id: 'yes', label: '是', sortOrder: 0 },
          { id: 'no', label: '否', sortOrder: 1 },
        ],
        config: { ...baseConfig, variant: 'yes_no' },
      });
      return;
    }
    if (nextType === 'dropdown') {
      onChange({
        ...question,
        type: 'single_choice',
        options: question.options?.length ? question.options : [{ id: crypto.randomUUID(), label: '', sortOrder: 0 }, { id: crypto.randomUUID(), label: '', sortOrder: 1 }],
        config: { ...baseConfig, renderAs: 'dropdown' },
      });
      return;
    }
    if (nextType === 'single_choice' || nextType === 'multiple_choice') {
      onChange({
        ...question,
        type: nextType,
        options: question.options?.length ? question.options : [{ id: crypto.randomUUID(), label: '', sortOrder: 0 }, { id: crypto.randomUUID(), label: '', sortOrder: 1 }],
        config: baseConfig,
      });
      return;
    }
    onChange({
      ...question,
      type: nextType,
      options: nextType === 'text' || nextType === 'rating' ? undefined : question.options,
      config: baseConfig,
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
        <select
          aria-label={`第 ${index + 1} 題類型`}
          value={displayType}
          onChange={(e) => applyDisplayType(e.target.value as DisplayQuestionType)}
          className="rounded border border-input bg-background px-2 py-1 text-xs"
        >
          {(Object.keys(TYPE_LABELS) as DisplayQuestionType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
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
        <button type="button" onClick={onRemove} className="text-xs text-destructive hover:underline">
          刪除
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className={`text-xs px-2 py-1 rounded ${activeTab === 'content' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          內容
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logic')}
          className={`text-xs px-2 py-1 rounded ${activeTab === 'logic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          邏輯
        </button>
      </div>

      {activeTab === 'content' && (
        <div className="space-y-3">
          <input
            type="text"
            value={question.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="題目文字"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            value={question.description ?? ''}
            onChange={(e) => updateField('description', e.target.value || undefined)}
            placeholder="題目說明（選填）"
            rows={2}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {isChoiceType && (
            <div className="space-y-2 pl-2">
              {(question.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`選項 ${i + 1}`}
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                  />
                  <button type="button" onClick={() => removeOption(i)} className="text-xs text-muted-foreground hover:text-destructive">
                    X
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOption} className="text-xs text-primary hover:underline">
                + 新增選項
              </button>
            </div>
          )}

          {isRatingLike && (
            <div className="space-y-2 pl-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">最大評分</span>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={(question.config?.maxRating as number) ?? 5}
                  onChange={(e) => patchConfig({ ...(question.config ?? {}), maxRating: Number(e.target.value) })}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
              {ratingSiblings.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">反向題</span>
                  <select
                    value={(question.config?.reverseOfIndex as number | undefined) ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const next = { ...(question.config ?? {}) } as Record<string, unknown>;
                      if (value === '') delete next.reverseOfIndex;
                      else next.reverseOfIndex = Number(value);
                      patchConfig(next);
                    }}
                    className="rounded border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="">無</option>
                    {ratingSiblings.map((s) => (
                      <option key={s.index} value={s.index}>
                        Q{s.index + 1} {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {isNumeric && (
            <div className="space-y-2 pl-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">最小值</span>
                <input
                  type="number"
                  value={(question.config?.minValue as number) ?? 0}
                  onChange={(e) => patchConfig({ ...(question.config ?? {}), minValue: Number(e.target.value) })}
                  className="w-20 rounded border border-input bg-background px-2 py-1 text-sm"
                />
                <span className="text-xs text-muted-foreground">最大值</span>
                <input
                  type="number"
                  value={(question.config?.maxValue as number) ?? 100}
                  onChange={(e) => patchConfig({ ...(question.config ?? {}), maxValue: Number(e.target.value) })}
                  className="w-20 rounded border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>
          )}

          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={question.config?.aiQualityCheckEnabled !== false}
                onChange={(e) => patchConfig({ ...(question.config ?? {}), aiQualityCheckEnabled: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span>啟用 AI 品質審核（此題）</span>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'logic' && (
        <div className="space-y-3">
          {(isChoiceType || isRatingLike) && (
            <button type="button" onClick={addRule} className="text-xs text-primary hover:underline">
              + 新增跳題規則
            </button>
          )}

          {rules.length === 0 && (
            <p className="text-xs text-muted-foreground">尚未設定跳題規則。</p>
          )}

          {rules.map((rule, ruleIndex) => (
            <div key={ruleIndex} className="rounded border border-border p-2 space-y-2">
              <div className="text-xs font-medium">規則 {ruleIndex + 1}</div>

              {isChoiceType && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">若選項為</span>
                  <select
                    value={rule.selectedOptionId ?? ''}
                    onChange={(e) => updateRule(ruleIndex, { selectedOptionId: e.target.value, selectedRating: undefined })}
                    className="rounded border border-input bg-background px-2 py-1 text-xs"
                  >
                    {optionItems.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isRatingLike && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">若評分等於</span>
                  <input
                    type="number"
                    min={0}
                    max={(question.config?.maxRating as number) ?? 10}
                    value={rule.selectedRating ?? 0}
                    onChange={(e) => updateRule(ruleIndex, { selectedRating: Number(e.target.value), selectedOptionId: undefined })}
                    className="w-16 rounded border border-input bg-background px-2 py-1 text-xs"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">則跳至</span>
                <select
                  value={rule.skipToEnd ? '__end__' : String(rule.skipToQuestionIndex ?? '')}
                  onChange={(e) => {
                    if (e.target.value === '__end__') {
                      updateRule(ruleIndex, { skipToEnd: true, skipToQuestionIndex: undefined });
                    } else {
                      updateRule(ruleIndex, { skipToEnd: false, skipToQuestionIndex: Number(e.target.value) });
                    }
                  }}
                  className="rounded border border-input bg-background px-2 py-1 text-xs"
                >
                  {jumpTargets.map((target) => (
                    <option key={target.index} value={target.index}>
                      Q{target.index + 1} {target.title}
                    </option>
                  ))}
                  <option value="__end__">結束問卷</option>
                </select>
                <button type="button" onClick={() => removeRule(ruleIndex)} className="text-xs text-destructive hover:underline">
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
