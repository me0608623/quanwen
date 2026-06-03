'use client';

import { useState } from 'react';
import type { SurveyQuestion, SurveyTheme } from '@/hooks/use-surveys';
import { evaluateSkipLogic } from '@/lib/skip-logic';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import { RatingScale, type RatingScaleConfig } from './rating-scale';
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND, fontFamilyClass } from './survey-style-panel';

interface Props {
  title: string;
  description?: string;
  coverImageUrl?: string;
  questions: SurveyQuestion[];
  theme?: SurveyTheme;
}

type PreviewAnswer = { selectedOptionIds?: string[]; ratingValue?: number; textAnswer?: string };

export function SurveyPreviewPlayer({ title, description, coverImageUrl, questions, theme }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, PreviewAnswer>>({});
  const [completed, setCompleted] = useState(false);

  if (completed || currentIdx >= questions.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">預覽完成</h3>
        <p className="mt-1 text-xs text-slate-600">您已到達預覽流程的尾端。</p>
        <button
          type="button"
          onClick={() => {
            setCurrentIdx(0);
            setAnswers({});
            setCompleted(false);
          }}
          className="mt-3 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-white"
        >
          重新預覽
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return <p className="text-xs text-slate-500">請新增題目以查看受試者預覽。</p>;
  }

  const q = questions[currentIdx];
  const questionImageUrl = resolveAssetUrl(q.imageUrl ?? (q.config?.imageUrl as string | undefined) ?? undefined);
  const resolvedCoverImageUrl = resolveAssetUrl(coverImageUrl);
  const isNumeric = q.type === 'text' && q.config?.inputType === 'numeric';
  const isDropdown = q.type === 'single_choice' && q.config?.renderAs === 'dropdown';
  const a = answers[currentIdx] ?? {};
  const setAns = (next: Partial<PreviewAnswer>) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { ...(prev[currentIdx] ?? {}), ...next } }));
  };

  const canNext = !q.isRequired ||
    (q.type === 'text' ? !!a.textAnswer?.trim() :
      q.type === 'rating' ? a.ratingValue != null :
        (q.type === 'single_choice' || q.type === 'multiple_choice') ? (a.selectedOptionIds?.length ?? 0) > 0 :
          true);

  return (
    <div
      className={`space-y-3 rounded-lg border border-slate-200 p-4 ${fontFamilyClass(theme?.fontFamily)}`}
      style={{ backgroundColor: theme?.backgroundColor ?? DEFAULT_BACKGROUND }}
    >
      <div>
        {resolvedCoverImageUrl && (
          <img src={resolvedCoverImageUrl} alt={title || '問卷封面'} className="mb-3 h-36 w-full rounded-lg object-cover" />
        )}
        <p className="text-[10px] uppercase tracking-wide text-slate-500">受試者預覽</p>
        <h3 className="text-sm font-semibold text-slate-900">{title || '未命名問卷'}</h3>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
      </div>

      <div className="h-1 rounded bg-slate-100">
        <div
          className="h-1 rounded"
          style={{
            backgroundColor: theme?.accentColor ?? DEFAULT_ACCENT,
            width: `${((currentIdx + 1) / questions.length) * 100}%`,
          }}
        />
      </div>
      <p className="text-[10px] text-slate-500">Q{currentIdx + 1} / {questions.length}</p>

      <p className="text-sm font-medium text-slate-900">{q.title || '未命名題目'}</p>
      {questionImageUrl && (
        <img src={questionImageUrl} alt={q.title || '題目圖片'} className="w-full rounded-lg border border-slate-200 object-cover" />
      )}

      {q.type === 'text' && (
        <textarea
          value={a.textAnswer ?? ''}
          onChange={(e) => setAns({ textAnswer: e.target.value })}
          rows={3}
          inputMode={isNumeric ? 'numeric' : undefined}
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
        />
      )}
      {q.type === 'rating' && (
        <RatingScale
          config={q.config as RatingScaleConfig | undefined}
          value={a.ratingValue ?? null}
          onSelect={(value) => setAns({ ratingValue: value })}
        />
      )}
      {isDropdown && (
        <select
          value={a.selectedOptionIds?.[0] ?? ''}
          onChange={(e) => setAns({ selectedOptionIds: e.target.value ? [e.target.value] : [] })}
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">請選擇一個選項</option>
          {(q.options ?? []).map((opt, i) => {
            const optId = opt.id ?? `__preview_${i}`;
            return (
              <option key={optId} value={optId}>
                {opt.label || '未命名選項'}
              </option>
            );
          })}
        </select>
      )}
      {(q.type === 'single_choice' || q.type === 'multiple_choice') && !isDropdown && (
        <div className="space-y-1.5">
          {(q.options ?? []).map((opt, i) => {
            const optId = opt.id ?? `__preview_${i}`;
            const selected = a.selectedOptionIds?.includes(optId);
            return (
              <label key={optId} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-xs">
                <input
                  type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                  name={`q${currentIdx}`}
                  checked={!!selected}
                  onChange={() => {
                    if (q.type === 'single_choice') setAns({ selectedOptionIds: [optId] });
                    else {
                      const prev = a.selectedOptionIds ?? [];
                      setAns({ selectedOptionIds: prev.includes(optId) ? prev.filter((x) => x !== optId) : [...prev, optId] });
                    }
                  }}
                />
                <span>{opt.label || '未命名選項'}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIdx((x) => Math.max(0, x - 1))}
          disabled={currentIdx === 0}
          className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 disabled:opacity-40"
        >
          上一步
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => {
            const decision = evaluateSkipLogic(currentIdx, q.config, a);
            if (decision.nextIndex === -1) setCompleted(true);
            else setCurrentIdx(decision.nextIndex);
          }}
          className="rounded px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: theme?.accentColor ?? DEFAULT_ACCENT }}
        >
          {currentIdx === questions.length - 1 ? '完成' : '下一步'}
        </button>
      </div>
    </div>
  );
}
