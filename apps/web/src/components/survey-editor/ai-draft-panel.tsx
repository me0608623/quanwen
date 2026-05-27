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

type QType = 'single_choice' | 'multiple_choice' | 'text' | 'rating';
const TYPE_OPTIONS: { value: QType; label: string }[] = [
  { value: 'single_choice', label: '單選' },
  { value: 'multiple_choice', label: '多選' },
  { value: 'text', label: '開放問答' },
  { value: 'rating', label: '評分' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export function AiDraftPanel({ onApply }: AiDraftPanelProps) {
  const [topic, setTopic] = useState('');
  const [purpose, setPurpose] = useState('');
  const [questionCount, setQuestionCount] = useState(8);
  const [targetAudience, setTargetAudience] = useState('');
  const [preferredTypes, setPreferredTypes] = useState<QType[]>([]);
  const [open, setOpen] = useState(false);
  // Phase II.14: 生成後先進 preview，使用者可逐題重生 / 換角度，再套用
  const [draft, setDraft] = useState<AiDraftResult | null>(null);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);

  const aiDraft = useAiDraft();
  const regenQ = useRegenerateQuestion();

  const toggleType = (t: QType) =>
    setPreferredTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const handleGenerate = async (avoidTitles?: string[]) => {
    if (!topic.trim()) return;
    try {
      const result = await aiDraft.mutateAsync({
        topic,
        purpose: purpose.trim() || undefined,
        questionCount,
        targetAudience: targetAudience.trim() || undefined,
        preferredTypes: preferredTypes.length > 0 ? preferredTypes : undefined,
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
        preferredType: current?.type as QType | undefined,
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
                  偏好題型（選填，可複選；不選則由 AI 自由混搭）
                </label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const active = preferredTypes.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleType(opt.value)}
                        className={
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                          (active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted')
                        }
                      >
                        {active ? '✓ ' : ''}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
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
                {draft.questions.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded border border-border bg-background px-2.5 py-2"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {TYPE_LABEL[q.type] ?? q.type}
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
                ))}
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
