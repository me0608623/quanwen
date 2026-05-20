'use client';

import { useState } from 'react';
import { useAiDraft, AiDraftResult } from '@/hooks/use-surveys';

interface AiDraftPanelProps {
  onApply: (draft: AiDraftResult) => void;
}

export function AiDraftPanel({ onApply }: AiDraftPanelProps) {
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(8);
  const [targetAudience, setTargetAudience] = useState('');
  const [open, setOpen] = useState(false);
  const aiDraft = useAiDraft();

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    try {
      const result = await aiDraft.mutateAsync({ topic, questionCount, targetAudience: targetAudience || undefined });
      onApply(result);
      setOpen(false);
    } catch (err) {
      // aiDraft.error 會 render；這裡只是避免 Unhandled Runtime Error
      console.warn('AI draft generation failed', err);
    }
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
          <p className="text-sm font-medium">用 GLM-5.1 自動產生問卷題目</p>

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

          {aiDraft.error && (
            <p className="text-xs text-destructive">
              生成失敗，請稍後再試。
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={aiDraft.isPending || !topic.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {aiDraft.isPending ? '生成中…' : '產生草稿'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
