'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSurvey, SurveyQuestion, AiDraftResult } from '@/hooks/use-surveys';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { AiDraftPanel } from '@/components/survey-editor/ai-draft-panel';

const defaultQuestion = (): SurveyQuestion => ({
  type: 'single_choice',
  title: '',
  sortOrder: 0,
  isRequired: true,
  options: [
    { label: '', sortOrder: 0 },
    { label: '', sortOrder: 1 },
  ],
});

export default function NewSurveyPage() {
  const router = useRouter();
  const createSurvey = useCreateSurvey();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState(0);
  const [targetCount, setTargetCount] = useState(100);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([defaultQuestion()]);

  const applyAiDraft = (draft: AiDraftResult) => {
    setTitle(draft.title);
    setDescription(draft.description ?? '');
    setQuestions(
      draft.questions.map((q, i) => ({ ...q, sortOrder: i })),
    );
  };

  const updateQuestion = (i: number, q: SurveyQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? { ...q, sortOrder: i } : old)));
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, sortOrder: idx })));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { ...defaultQuestion(), sortOrder: prev.length }]);
  };

  const handleSaveDraft = async () => {
    try {
      const survey = await createSurvey.mutateAsync({
        title: title || '未命名問卷',
        description: description || undefined,
        rewardPoints,
        targetCount,
        questions,
      });
      router.push(`/dashboard/surveys/${survey.id}`);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '儲存失敗，請稍後再試');
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新增問卷</h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 返回
        </button>
      </div>

      {/* AI Draft */}
      <AiDraftPanel onApply={applyAiDraft} />

      {/* Basic info */}
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">基本資訊</h2>

        <div>
          <label className="mb-1 block text-sm font-medium">問卷標題 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="輸入問卷標題"
            maxLength={200}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">問卷說明</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="讓受試者了解問卷目的…"
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">獎勵點數（NT$）</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={rewardPoints}
              onChange={(e) => setRewardPoints(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">目標收集份數</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Questions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            題目（{questions.length} 題）
          </h2>
        </div>

        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            question={q}
            index={i}
            onChange={(updated) => updateQuestion(i, updated)}
            onRemove={() => removeQuestion(i)}
            ratingSiblings={questions
              .map((qq, idx) => ({ q: qq, idx }))
              .filter(({ q: qq, idx }) => qq.type === 'rating' && idx !== i)
              .map(({ q: qq, idx }) => ({ index: idx, title: qq.title }))}
          />
        ))}

        <button
          type="button"
          onClick={addQuestion}
          className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          + 新增題目
        </button>
      </section>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        {createSurvey.error && (
          <p className="text-sm text-destructive">儲存失敗，請稍後再試。</p>
        )}
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={createSurvey.isPending}
          className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {createSurvey.isPending ? '儲存中…' : '儲存草稿'}
        </button>
      </div>
    </main>
  );
}
