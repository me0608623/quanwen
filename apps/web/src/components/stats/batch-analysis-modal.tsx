'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useBatchInterpretStatistics } from '@/hooks/use-analytics';
import type { InterpretPayload, BatchAnalysisResult } from '@/hooks/use-analytics';

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
}

export interface BatchAnalysisModalProps {
  surveyId: string;
  questionStats: QuestionStat[];
  aiRemaining: number;
  pointsBalance: number;
  open: boolean;
  onClose: (results?: BatchAnalysisResult) => void;
}

const POINTS_PER_OVERFLOW = 10;

function isChoiceType(type: string): boolean {
  return ['single_choice', 'multiple_choice', 'dropdown', 'yes_no'].includes(type);
}

function isRatingType(type: string): boolean {
  return type === 'rating';
}

export function BatchAnalysisModal({
  surveyId,
  questionStats,
  aiRemaining,
  pointsBalance,
  open,
  onClose,
}: BatchAnalysisModalProps) {
  const ratingQs = questionStats.filter((q) => isRatingType(q.type));
  const choiceQs = questionStats.filter((q) => isChoiceType(q.type));

  // ── per-analysis state ──────────────────────────────────────────────────────
  const [crossEnabled, setCrossEnabled] = useState(false);
  const [crossA, setCrossA] = useState('');
  const [crossB, setCrossB] = useState('');

  const [alphaEnabled, setAlphaEnabled] = useState(false);

  const [npsEnabled, setNpsEnabled] = useState(false);
  const [npsQ, setNpsQ] = useState('');

  const [corrEnabled, setCorrEnabled] = useState(false);
  const [corrA, setCorrA] = useState('');
  const [corrB, setCorrB] = useState('');

  const [diffEnabled, setDiffEnabled] = useState(false);
  const [diffRating, setDiffRating] = useState('');
  const [diffChoice, setDiffChoice] = useState('');

  const [regrEnabled, setRegrEnabled] = useState(false);
  const [regrDependent, setRegrDependent] = useState('');
  const [regrIndependents, setRegrIndependents] = useState<string[]>([]);

  const [segEnabled, setSegEnabled] = useState(false);

  // ── validation ──────────────────────────────────────────────────────────────
  const crossValid = crossEnabled && !!crossA && !!crossB && crossA !== crossB;
  const alphaValid = alphaEnabled && ratingQs.length >= 2;
  const npsValid = npsEnabled && !!npsQ;
  const corrValid = corrEnabled && !!corrA && !!corrB && corrA !== corrB;
  const diffValid = diffEnabled && !!diffRating && !!diffChoice;
  const regrValid =
    regrEnabled &&
    !!regrDependent &&
    regrIndependents.length >= 2 &&
    !regrIndependents.includes(regrDependent);
  const segValid = segEnabled && ratingQs.length >= 1;

  // ── build payload ────────────────────────────────────────────────────────────
  const validAnalyses: InterpretPayload[] = [];
  if (crossValid) validAnalyses.push({ surveyId, analysisType: 'cross_tab', questionA: crossA, questionB: crossB });
  if (alphaValid) validAnalyses.push({ surveyId, analysisType: 'scale_reliability' });
  if (npsValid) validAnalyses.push({ surveyId, analysisType: 'nps', questionId: npsQ });
  if (corrValid) validAnalyses.push({ surveyId, analysisType: 'correlation', questionA: corrA, questionB: corrB });
  if (diffValid) validAnalyses.push({ surveyId, analysisType: 'group_comparison', ratingQuestionId: diffRating, groupQuestionId: diffChoice });
  if (regrValid) validAnalyses.push({ surveyId, analysisType: 'regression', dependentId: regrDependent, independentIds: regrIndependents });
  if (segValid) validAnalyses.push({ surveyId, analysisType: 'segmentation' });

  // ── cost preview ─────────────────────────────────────────────────────────────
  const n = validAnalyses.length;
  const aiUsed = Math.min(n, aiRemaining);
  const pointsNeeded = Math.max(0, n - aiRemaining) * POINTS_PER_OVERFLOW;
  const hasEnoughPoints = pointsBalance >= pointsNeeded;
  const canSubmit = n > 0 && hasEnoughPoints;

  const batch = useBatchInterpretStatistics();

  const handleSubmit = () => {
    if (!canSubmit) return;
    batch.mutate(
      { analyses: validAnalyses },
      { onSuccess: (result) => onClose(result) },
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="batch-modal-title" className="font-bold text-slate-900">
              批次 AI 統計分析
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">最多 7 種分析，完成選題後一次批次送出</p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            aria-label="關閉批次分析視窗"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* 1. 交叉分析 */}
          <AnalysisCard
            id="cross_tab"
            label="交叉分析"
            desc="探索兩個選擇題之間的關聯（卡方 + Cramer's V）"
            enabled={crossEnabled}
            onToggle={setCrossEnabled}
            isValid={crossValid}
          >
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuestionSelect
                label="選擇題 A"
                options={choiceQs}
                value={crossA}
                onChange={setCrossA}
                exclude={crossB}
                placeholder="選擇題目 A"
              />
              <QuestionSelect
                label="選擇題 B"
                options={choiceQs}
                value={crossB}
                onChange={setCrossB}
                exclude={crossA}
                placeholder="選擇題目 B"
              />
            </div>
            {choiceQs.length < 2 && (
              <p className="mt-2 text-xs text-amber-600">問卷中選擇題不足 2 題</p>
            )}
          </AnalysisCard>

          {/* 2. 信度 α（自動） */}
          <AnalysisCard
            id="scale_reliability"
            label="量表信度（Cronbach's α）"
            desc="自動使用全部評分題計算量表內部一致性"
            enabled={alphaEnabled}
            onToggle={setAlphaEnabled}
            isValid={alphaValid}
          >
            {ratingQs.length >= 2 ? (
              <p className="mt-2 text-xs text-slate-500">
                自動納入全部 {ratingQs.length} 個評分題
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-600">需要至少 2 個評分題（目前 {ratingQs.length} 個）</p>
            )}
          </AnalysisCard>

          {/* 3. NPS */}
          <AnalysisCard
            id="nps"
            label="NPS（淨推薦值）"
            desc="計算推薦意願分布與 NPS 指數"
            enabled={npsEnabled}
            onToggle={setNpsEnabled}
            isValid={npsValid}
          >
            <div className="mt-3">
              <QuestionSelect
                label="評分題（0–10 量尺）"
                options={ratingQs}
                value={npsQ}
                onChange={setNpsQ}
                placeholder="選擇評分題"
              />
            </div>
            {ratingQs.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">問卷中無評分題</p>
            )}
          </AnalysisCard>

          {/* 4. 相關性 */}
          <AnalysisCard
            id="correlation"
            label="相關性分析（Pearson r）"
            desc="計算兩個評分題之間的線性相關係數"
            enabled={corrEnabled}
            onToggle={setCorrEnabled}
            isValid={corrValid}
          >
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuestionSelect
                label="評分題 A"
                options={ratingQs}
                value={corrA}
                onChange={setCorrA}
                exclude={corrB}
                placeholder="選擇評分題 A"
              />
              <QuestionSelect
                label="評分題 B"
                options={ratingQs}
                value={corrB}
                onChange={setCorrB}
                exclude={corrA}
                placeholder="選擇評分題 B"
              />
            </div>
            {ratingQs.length < 2 && (
              <p className="mt-2 text-xs text-amber-600">需要至少 2 個評分題</p>
            )}
          </AnalysisCard>

          {/* 5. 差異性（t / F） */}
          <AnalysisCard
            id="group_comparison"
            label="差異性檢定（t / ANOVA）"
            desc="比較不同分組在評分題上的平均差異"
            enabled={diffEnabled}
            onToggle={setDiffEnabled}
            isValid={diffValid}
          >
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QuestionSelect
                label="依變數（評分題）"
                options={ratingQs}
                value={diffRating}
                onChange={setDiffRating}
                placeholder="選擇評分題"
              />
              <QuestionSelect
                label="分組變數（選擇題）"
                options={choiceQs}
                value={diffChoice}
                onChange={setDiffChoice}
                placeholder="選擇分組題"
              />
            </div>
          </AnalysisCard>

          {/* 6. 迴歸 */}
          <AnalysisCard
            id="regression"
            label="迴歸分析（Multiple Regression）"
            desc="以多個評分題（自變數）預測一個依變數"
            enabled={regrEnabled}
            onToggle={setRegrEnabled}
            isValid={regrValid}
          >
            <div className="mt-3 space-y-3">
              <QuestionSelect
                label="依變數（1 個評分題）"
                options={ratingQs}
                value={regrDependent}
                onChange={(val) => {
                  setRegrDependent(val);
                  setRegrIndependents((ids) => ids.filter((id) => id !== val));
                }}
                placeholder="選擇依變數"
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  自變數（選 ≥2，不可與依變數重複）
                </p>
                {ratingQs.filter((q) => q.questionId !== regrDependent).length === 0 ? (
                  <p className="text-xs text-amber-600">
                    {ratingQs.length < 3 ? `需要至少 3 個評分題（目前 ${ratingQs.length} 個）` : '請先選擇依變數'}
                  </p>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {ratingQs
                      .filter((q) => q.questionId !== regrDependent)
                      .map((q) => (
                        <label
                          key={q.questionId}
                          className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5 text-xs hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={regrIndependents.includes(q.questionId)}
                            onChange={(e) =>
                              setRegrIndependents((ids) =>
                                e.target.checked
                                  ? [...ids, q.questionId]
                                  : ids.filter((id) => id !== q.questionId),
                              )
                            }
                            className="h-3.5 w-3.5 cursor-pointer rounded accent-[#126b8a]"
                          />
                          <span className="truncate text-slate-700">{q.title}</span>
                        </label>
                      ))}
                  </div>
                )}
                {regrEnabled && regrDependent && regrIndependents.length < 2 && (
                  <p className="mt-1 text-xs text-amber-600">請至少勾選 2 個自變數</p>
                )}
              </div>
            </div>
          </AnalysisCard>

          {/* 7. 分群（自動） */}
          <AnalysisCard
            id="segmentation"
            label="分群分析（K-means）"
            desc="自動對受訪者分群，找出共同特徵（自動使用全部評分題）"
            enabled={segEnabled}
            onToggle={setSegEnabled}
            isValid={segValid}
          >
            {ratingQs.length >= 1 ? (
              <p className="mt-2 text-xs text-slate-500">
                自動納入全部 {ratingQs.length} 個評分題
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-600">需要至少 1 個評分題</p>
            )}
          </AnalysisCard>
        </div>

        {/* Footer：成本預覽 + 送出 */}
        <div className="border-t border-border px-6 py-4 space-y-3">
          {n > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">
                成本預覽：{n} 項分析
              </p>
              <p className="mt-1 text-xs text-slate-600">
                消耗{' '}
                <span className="font-semibold text-[#126b8a]">
                  {aiUsed} 次 AI 額度
                </span>
                {pointsNeeded > 0 && (
                  <>
                    {' '}＋{' '}
                    <span
                      className={`font-semibold ${
                        hasEnoughPoints ? 'text-amber-700' : 'text-red-600'
                      }`}
                    >
                      {pointsNeeded} 積分
                    </span>
                    （目前餘額：{pointsBalance} 積分）
                  </>
                )}
              </p>
              {!hasEnoughPoints && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  積分不足：需 {pointsNeeded} 積分，目前僅有 {pointsBalance} 積分
                </p>
              )}
            </div>
          )}

          {batch.error && (
            <div
              role="alert"
              className="rounded-md bg-red-50 px-4 py-2 text-xs text-red-700"
            >
              {batch.error.code === '422_points_insufficient'
                ? `積分不足：需要 ${batch.error.needed} 積分，目前僅有 ${batch.error.available} 積分`
                : batch.error.code === '429_ai_quota'
                  ? 'AI 分析額度已用完，請明天再試或升級方案'
                  : batch.error.message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={batch.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || batch.isPending}
              aria-disabled={!canSubmit || batch.isPending}
              className="rounded-lg bg-[#126b8a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f5d78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batch.isPending ? '分析中…' : n > 0 ? `送出 ${n} 項分析` : '請先選擇分析項目'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AnalysisCard({
  id,
  label,
  desc,
  enabled,
  onToggle,
  isValid,
  children,
}: {
  id: string;
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  isValid: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        enabled ? 'border-[#126b8a]/40 bg-[#126b8a]/[0.03]' : 'border-border'
      }`}
    >
      <label
        htmlFor={`batch-${id}`}
        className="flex cursor-pointer items-start gap-3 px-4 py-3"
      >
        <input
          id={`batch-${id}`}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-[#126b8a]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{label}</span>
            {enabled && !isValid && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                需完成選題
              </span>
            )}
            {enabled && isValid && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                已就緒
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
        </div>
      </label>
      {enabled && children && (
        <div className="border-t border-[#126b8a]/10 px-4 pb-3">{children}</div>
      )}
    </div>
  );
}

function QuestionSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  exclude,
}: {
  label: string;
  options: Array<{ questionId: string; title: string }>;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  exclude?: string;
}) {
  const filtered = options.filter((o) => o.questionId !== exclude);
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#126b8a]/30"
      >
        <option value="">{placeholder ?? '請選擇'}</option>
        {filtered.map((o) => (
          <option key={o.questionId} value={o.questionId}>
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );
}
