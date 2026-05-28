'use client';

import { useState } from 'react';
import type { SurveyQuestion } from '@/hooks/use-surveys';
import { evaluateSkipLogic } from '@/lib/skip-logic';
import { RatingScale, RatingScaleConfig } from './rating-scale';

interface Props {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  open: boolean;
  onClose: () => void;
}

/**
 * Phase G.3: 問卷預覽（surveyor 端模擬受試者填寫流程）
 *
 * 把跳題邏輯也跑出來，讓問券方上架前能確認流程正確。
 * 因 questions 在編輯狀態無 DB id，這裡用 sortOrder 索引。
 */
export function SurveyPreviewModal({ title, description, questions, open, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, { selectedOptionIds?: string[]; ratingValue?: number; textAnswer?: string }>>({});
  const [completed, setCompleted] = useState(false);

  if (!open) return null;

  // 重置
  const reset = () => {
    setCurrentIdx(0);
    setAnswers({});
    setCompleted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (completed || currentIdx >= questions.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-base font-bold text-slate-900">✅ 預覽完成</h2>
          <p className="mt-2 text-sm text-slate-600">受試者看到「感謝填寫」頁面。</p>
          <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
            <summary className="cursor-pointer text-[11px] text-slate-600">查看答題流程（{Object.keys(answers).length} 題）</summary>
            <pre className="mt-2 text-[10px] text-slate-700 overflow-x-auto">{JSON.stringify(answers, null, 2)}</pre>
          </details>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={reset} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">重新開始</button>
            <button onClick={handleClose} className="rounded bg-[#126b8a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78]">關閉預覽</button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const a = answers[currentIdx] ?? {};

  const setAns = (next: Partial<typeof a>) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: { ...(prev[currentIdx] ?? {}), ...next } }));
  };

  const goNext = () => {
    const decision = evaluateSkipLogic(currentIdx, q.config, a);
    if (decision.nextIndex === -1) {
      setCompleted(true);
    } else {
      setCurrentIdx(decision.nextIndex);
    }
  };

  const goBack = () => {
    if (currentIdx === 0) return;
    setCurrentIdx(currentIdx - 1);
  };

  // 判斷答完才能 next
  const canNext = (() => {
    if (!q.isRequired) return true;
    if (q.type === 'text') return !!a.textAnswer && a.textAnswer.trim().length > 0;
    if (q.type === 'rating') return a.ratingValue != null;
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      return Array.isArray(a.selectedOptionIds) && a.selectedOptionIds.length > 0;
    }
    return true;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-amber-700">受試者預覽模式</p>
            <h2 className="text-base font-bold text-slate-900">{title || '（未命名問卷）'}</h2>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {description && <p className="text-xs text-slate-500 mb-3">{description}</p>}

        {/* Progress */}
        <div className="mb-3 h-1 rounded bg-slate-100">
          <div
            className="h-1 rounded bg-[#126b8a] transition-all"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mb-3">Q{currentIdx + 1} / {questions.length}</p>

        {/* Question */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-800">
            {q.title || '（題目未填）'}
            {q.isRequired && <span className="text-red-500 ml-1">*</span>}
          </p>
          {q.description && <p className="text-xs text-slate-500">{q.description}</p>}

          {q.type === 'text' && (
            <textarea
              value={a.textAnswer ?? ''}
              onChange={(e) => setAns({ textAnswer: e.target.value })}
              rows={3}
              placeholder="輸入答案…"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}

          {q.type === 'rating' && (
            <RatingScale
              config={q.config as RatingScaleConfig | undefined}
              value={a.ratingValue ?? null}
              onSelect={(value) => setAns({ ratingValue: value })}
            />
          )}

          {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
            <div className="space-y-1.5">
              {(q.options ?? []).map((opt, i) => {
                const optId = opt.id ?? `__preview_${i}`;
                const selected = a.selectedOptionIds?.includes(optId);
                return (
                  <label
                    key={optId}
                    className={`flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors ${
                      selected ? 'border-[#126b8a] bg-[#126b8a]/[0.05]' : 'border-slate-200 hover:border-[#126b8a]/50'
                    }`}
                  >
                    <input
                      type={q.type === 'single_choice' ? 'radio' : 'checkbox'}
                      name={`q${currentIdx}`}
                      checked={!!selected}
                      onChange={() => {
                        if (q.type === 'single_choice') {
                          setAns({ selectedOptionIds: [optId] });
                        } else {
                          const prev = a.selectedOptionIds ?? [];
                          setAns({
                            selectedOptionIds: prev.includes(optId)
                              ? prev.filter((x) => x !== optId)
                              : [...prev, optId],
                          });
                        }
                      }}
                    />
                    <span className="text-sm text-slate-700">{opt.label || '（選項未填）'}</span>
                  </label>
                );
              })}
            </div>
          )}

          {q.type === 'matrix' && (() => {
            const m = (q.config?.matrix as { rows?: string[]; columns?: string[]; scale?: string } | undefined) ?? {};
            const rows = (m.rows ?? []).filter(Boolean);
            const cols = (m.columns ?? []).filter(Boolean);
            const scale = m.scale ?? 'single';
            if (rows.length === 0 || cols.length === 0) {
              return <p className="rounded bg-amber-50 p-2 text-xs text-amber-700">矩陣題尚未設定列/欄</p>;
            }
            const matrixAnswer = (a.textAnswer ? JSON.parse(a.textAnswer) : {}) as Record<string, string | string[]>;
            const setCell = (rowIdx: number, colIdx: number) => {
              const next = { ...matrixAnswer };
              const rowKey = `r${rowIdx}`;
              const colVal = `c${colIdx}`;
              if (scale === 'multiple') {
                const arr = Array.isArray(next[rowKey]) ? (next[rowKey] as string[]) : [];
                next[rowKey] = arr.includes(colVal) ? arr.filter((x) => x !== colVal) : [...arr, colVal];
              } else {
                next[rowKey] = colVal;
              }
              setAns({ textAnswer: JSON.stringify(next) });
            };
            const isPicked = (rowIdx: number, colIdx: number) => {
              const v = matrixAnswer[`r${rowIdx}`];
              if (!v) return false;
              if (Array.isArray(v)) return v.includes(`c${colIdx}`);
              return v === `c${colIdx}`;
            };
            return (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="p-1.5"></th>
                      {cols.map((c, i) => (
                        <th key={i} className="p-1.5 font-medium text-slate-600 border-b border-slate-200 min-w-[50px]">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={ri}>
                        <td className="p-1.5 text-slate-700 border-r border-slate-200 pr-2">{r}</td>
                        {cols.map((_, ci) => (
                          <td key={ci} className="p-1.5 text-center">
                            <input
                              type={scale === 'multiple' ? 'checkbox' : 'radio'}
                              name={`matrix_${currentIdx}_r${ri}`}
                              checked={isPicked(ri, ci)}
                              onChange={() => setCell(ri, ci)}
                              className="cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={currentIdx === 0}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← 上一題
          </button>
          <button
            onClick={goNext}
            disabled={!canNext}
            className="rounded bg-[#126b8a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78] disabled:opacity-50"
          >
            {currentIdx === questions.length - 1 ? '完成' : '下一題 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
