'use client';

import { useState } from 'react';
import {
  useAiDraft,
  useRegenerateQuestion,
  AiDraftResult,
} from '@/hooks/use-surveys';
import { Spinner } from '@/components/ui/spinner';

interface AiDraftPanelProps {
  onApply: (draft: AiDraftResult) => void;
}

// 顯示於預覽的 DB 題型標籤
const TYPE_LABEL: Record<string, string> = {
  single_choice: '單選',
  multiple_choice: '多選',
  text: '開放問答',
  rating: '評分',
  matrix: '矩陣',
};

// 生成可指定的題型(含學術量表變體)。scale_* 最終會變成帶錨點的 rating。
type GenType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'rating'
  | 'scale_agreement'
  | 'scale_frequency';

const TYPE_OPTIONS: { value: GenType; label: string; hint?: string }[] = [
  { value: 'single_choice', label: '單選' },
  { value: 'multiple_choice', label: '多選' },
  { value: 'rating', label: '評分' },
  { value: 'scale_agreement', label: '同意度量表', hint: '非常不同意 → 非常同意（0~5）' },
  { value: 'scale_frequency', label: '頻率量表', hint: '從來沒有 → 總是如此（0~5）' },
  { value: 'text', label: '開放問答' },
];
const DEFAULT_TYPE_COUNT = 3;

export function AiDraftPanel({ onApply }: AiDraftPanelProps) {
  const [topic, setTopic] = useState('');
  const [purpose, setPurpose] = useState('');
  const [questionCount, setQuestionCount] = useState(8);
  const [targetAudience, setTargetAudience] = useState('');
  // Phase II.15: 逐題型題數。key 存在 = 該型被勾選;value = 題數。
  const [typeCounts, setTypeCounts] = useState<Partial<Record<GenType, number>>>({});
  const [open, setOpen] = useState(false);
  // Phase II.14: 生成後先進 preview，使用者可逐題重生 / 換角度，再套用
  const [draft, setDraft] = useState<AiDraftResult | null>(null);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);

  const aiDraft = useAiDraft();
  const regenQ = useRegenerateQuestion();

  const toggleType = (t: GenType) =>
    setTypeCounts((prev) => {
      if (t in prev) {
        const next = { ...prev };
        delete next[t];
        return next;
      }
      return { ...prev, [t]: DEFAULT_TYPE_COUNT };
    });

  const setTypeCount = (t: GenType, n: number) =>
    setTypeCounts((prev) => ({ ...prev, [t]: Math.max(1, Math.min(20, n || 1)) }));

  // 已勾選的題型規格(供送出 + 計算總題數)
  const typeSpecs = (Object.entries(typeCounts) as [GenType, number][])
    .filter(([, c]) => c > 0)
    .map(([type, count]) => ({ type, count }));
  const specsTotal = typeSpecs.reduce((sum, s) => sum + s.count, 0);
  const hasSpecs = typeSpecs.length > 0;

  const handleGenerate = async (avoidTitles?: string[]) => {
    if (!topic.trim()) return;
    try {
      const result = await aiDraft.mutateAsync({
        topic,
        purpose: purpose.trim() || undefined,
        questionCount: hasSpecs ? undefined : questionCount,
        targetAudience: targetAudience.trim() || undefined,
        typeSpecs: hasSpecs ? typeSpecs : undefined,
        avoidTitles,
      });
      setDraft(result);
    } catch (err) {
      console.warn('AI draft generation failed', err);
    }
  };

  const handleRegenOne = async (idx: number) => {
    if (!draft) return;
    setRegenIdx(idx);
    try {
      const current = draft.questions[idx];
      const result = await regenQ.mutateAsync({
        topic,
        purpose: purpose.trim() || undefined,
        currentTitle: current?.title ?? '',
        otherTitles: draft.questions.filter((_, i) => i !== idx).map((q) => q.title),
        preferredType: current?.type as
          | 'single_choice'
          | 'multiple_choice'
          | 'text'
          | 'rating'
          | undefined,
      });
      setDraft({
        ...draft,
        questions: draft.questions.map((q, i) => (i === idx ? result.question : q)),
      });
    } catch (err) {
      console.warn('regen question failed', err);
    } finally {
      setRegenIdx(null);
    }
  };

  const handleApply = () => {
    if (!draft) return;
    onApply(draft);
    reset();
  };

  const reset = () => {
    setDraft(null);
    setOpen(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
      >
        ✨ AI 草稿生成
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          {/* 輸入區 — draft 出來後收合，避免畫面太長 */}
          {!draft && (
            <>
              <p className="text-sm font-medium">AI 自動產生問卷題目</p>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">研究主題 *</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例：大學生對 AI 工具的使用習慣"
                  maxLength={200}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  研究目的（選填，描述越清楚 AI 生得越貼題）
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="例：了解使用頻率、品牌偏好與付費意願，作為新產品定位依據"
                  maxLength={500}
                  rows={2}
                  className="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex gap-4">
                {!hasSpecs && (
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-muted-foreground">題目數量</label>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">目標受眾（選填）</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="例：18-35 歲學生"
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  題型與題數（選填，可複選；勾選後設定各題型題數，不選則由 AI 自由混搭）
                </label>
                <div className="space-y-1.5">
                  {TYPE_OPTIONS.map((opt) => {
                    const active = opt.value in typeCounts;
                    const count = typeCounts[opt.value] ?? DEFAULT_TYPE_COUNT;
                    return (
                      <div
                        key={opt.value}
                        className={
                          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ' +
                          (active ? 'border-primary bg-primary/5' : 'border-border')
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleType(opt.value)}
                          className={
                            'flex items-center gap-1.5 text-xs font-medium ' +
                            (active ? 'text-primary' : 'text-muted-foreground')
                          }
                        >
                          <span
                            className={
                              'inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ' +
                              (active
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border')
                            }
                          >
                            {active ? '✓' : ''}
                          </span>
                          {opt.label}
                        </button>
                        {opt.hint && (
                          <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                        )}
                        {active && (
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setTypeCount(opt.value, count - 1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm text-muted-foreground hover:bg-muted"
                              aria-label="減少題數"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={count}
                              onChange={(e) => setTypeCount(opt.value, Number(e.target.value))}
                              className="w-12 rounded border border-input bg-background px-1.5 py-1 text-center text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setTypeCount(opt.value, count + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm text-muted-foreground hover:bg-muted"
                              aria-label="增加題數"
                            >
                              ＋
                            </button>
                            <span className="text-[11px] text-muted-foreground">題</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {hasSpecs && (
                  <p className="mt-1.5 text-[11px] font-medium text-primary">
                    共 {specsTotal} 題
                    {specsTotal > 30 ? '（超過上限 30，將自動截斷）' : ''}
                  </p>
                )}
              </div>

              {aiDraft.error && (
                <p className="text-xs text-destructive">生成失敗，請稍後再試。</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={aiDraft.isPending || !topic.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {aiDraft.isPending ? (
                    <>
                      <Spinner />
                      生成中…
                    </>
                  ) : (
                    '產生草稿'
                  )}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  取消
                </button>
              </div>

              {aiDraft.isPending && (
                <div className="space-y-1.5" aria-live="polite">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Spinner className="h-3 w-3 text-primary" />
                    AI 生成中，約需 20–30 秒，請稍候…
                  </p>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="q-progress-bar h-full w-1/3 rounded-full bg-primary" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Phase II.14: 預覽 + 逐題重生 + 換角度 */}
          {draft && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{draft.title}</p>
                  {draft.description && (
                    <p className="text-xs text-slate-500">{draft.description}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {draft.questions.length} 題
                </span>
              </div>

              {draft.notes && draft.notes.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50/60 p-2 text-[11px] text-amber-800">
                  AI 自動調整：{draft.notes.join('；')}
                </div>
              )}

              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {draft.questions.map((q, i) => {
                  const cfg = q.config as
                    | { minLabel?: string; maxLabel?: string; maxRating?: number; scaleStart?: number }
                    | undefined;
                  const isScale = q.type === 'rating' && !!(cfg?.minLabel || cfg?.maxLabel);
                  const start = cfg?.scaleStart === 0 ? 0 : 1;
                  const max = cfg?.maxRating ?? 5;
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded border border-border bg-background px-2.5 py-2"
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {isScale ? '量表' : TYPE_LABEL[q.type] ?? q.type}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-800">
                          {i + 1}. {q.title}
                        </p>
                        {q.options && q.options.length > 0 && (
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">
                            {q.options.map((o) => o.label).join(' / ')}
                          </p>
                        )}
                        {isScale && (
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">
                            {cfg?.minLabel} … {cfg?.maxLabel}（{start}–{max} 分）
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRegenOne(i)}
                        disabled={regenQ.isPending}
                        title="換一題"
                        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        {regenIdx === i ? '…' : '🔄'}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  ✓ 套用到編輯器
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerate(draft.questions.map((q) => q.title))}
                  disabled={aiDraft.isPending}
                  className="rounded-md border border-primary/50 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {aiDraft.isPending ? '重生中…' : '🎲 換個角度重生整份'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
