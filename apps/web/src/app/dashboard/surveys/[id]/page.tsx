'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  type AudienceCriteria,
  type SurveyQuestion,
  useBudgetCheck,
  useDeleteSurvey,
  usePublishSurvey,
  useSurvey,
  useUpdateSurvey,
} from '@/hooks/use-surveys';
import { AiDraftPanel } from '@/components/survey-editor/ai-draft-panel';
import { AiImprovePanel } from '@/components/survey-editor/ai-improve-panel';
import { AntiCheatPanel } from '@/components/survey-editor/anti-cheat-panel';
import { AudienceTargeting } from '@/components/survey-editor/audience-targeting';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { SurveyPreviewModal } from '@/components/survey-editor/survey-preview-modal';
import { SurveyPreviewPlayer } from '@/components/survey-editor/survey-preview-player';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  published: 'Published',
  paused: 'Paused',
  closed: 'Closed',
  rejected: 'Rejected',
};

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: survey, isLoading } = useSurvey(id);
  const updateSurvey = useUpdateSurvey(id);
  const publishSurvey = usePublishSurvey();
  const deleteSurvey = useDeleteSurvey();
  const { data: budgetCheck } = useBudgetCheck(id, survey?.status === 'draft' || survey?.status === 'rejected');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [minReputation, setMinReputation] = useState(0);
  const [audience, setAudience] = useState<AudienceCriteria>({});
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!survey) return;
    setTitle(survey.title);
    setDescription(survey.description ?? '');
    setQuestions(survey.questions);
    setMinReputation(Number(survey.audienceCriteria?.minReputationScore ?? 0));
    setAudience(survey.audienceCriteria ?? {});
  }, [survey]);

  const canEdit = survey?.status === 'draft' || survey?.status === 'rejected';
  const livePreviewDraft = useDebouncedValue({ title, description, questions }, 350);

  const markDirty = () => setDirty(true);

  const showAxiosError = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { message?: string } } };
    alert(e?.response?.data?.message ?? fallback);
  };

  const handleSave = async () => {
    const audienceCriteria = {
      ...audience,
      minReputationScore: minReputation > 0 ? minReputation : undefined,
    };

    try {
      await updateSurvey.mutateAsync({ title, description, questions, audienceCriteria });
      setDirty(false);
    } catch (err) {
      showAxiosError(err, 'Failed to save survey draft.');
    }
  };

  const handlePublish = async () => {
    try {
      await publishSurvey.mutateAsync(id);
    } catch (err) {
      showAxiosError(err, 'Failed to publish survey.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this draft survey?')) return;

    try {
      await deleteSurvey.mutateAsync(id);
      router.push('/dashboard');
    } catch (err) {
      showAxiosError(err, 'Failed to delete survey.');
    }
  };

  const updateQuestion = (index: number, question: SurveyQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === index ? { ...question, sortOrder: index } : old)));
    markDirty();
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index).map((q, idx) => ({ ...q, sortOrder: idx })));
    markDirty();
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        type: 'single_choice',
        title: '',
        sortOrder: prev.length,
        isRequired: true,
        options: [{ label: '', sortOrder: 0 }, { label: '', sortOrder: 1 }],
      },
    ]);
    markDirty();
  };

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading survey...</div>;
  if (!survey) return <div className="p-10 text-sm text-destructive">Survey not found.</div>;

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-muted-foreground hover:underline">
            Back to dashboard
          </button>
          <h1 className="mt-1 text-2xl font-bold">{survey.title}</h1>
          <p className="text-sm text-muted-foreground">{STATUS_LABELS[survey.status] ?? survey.status}</p>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={updateSurvey.isPending}
                className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {updateSurvey.isPending ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={publishSurvey.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Publish
            </button>
            <button onClick={handleDelete} className="text-sm text-destructive hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>

      {canEdit && budgetCheck && !budgetCheck.sufficient && budgetCheck.requiredAmount > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Insufficient budget to publish. Required: NT${budgetCheck.requiredAmount.toLocaleString()}, wallet: NT$
          {budgetCheck.walletBalance.toLocaleString()}. <Link href="/wallet" className="underline">Top up wallet</Link>.
        </div>
      )}

      {canEdit && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</h2>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Open Large Preview
            </button>
          </div>
          <SurveyPreviewPlayer
            title={livePreviewDraft.title}
            description={livePreviewDraft.description}
            questions={livePreviewDraft.questions}
          />
        </section>
      )}

      <SurveyPreviewModal
        title={livePreviewDraft.title}
        description={livePreviewDraft.description}
        questions={livePreviewDraft.questions}
        open={showPreview}
        onClose={() => setShowPreview(false)}
      />

      {canEdit && (
        <AiDraftPanel
          onApply={(draft) => {
            setTitle(draft.title);
            setDescription(draft.description ?? '');
            setQuestions(draft.questions.map((q, idx) => ({ ...q, sortOrder: idx })));
            markDirty();
          }}
        />
      )}

      {survey.questions.length > 0 && <AiImprovePanel surveyId={survey.id} />}

      {canEdit && questions.length > 0 && (
        <AntiCheatPanel
          surveyId={survey.id}
          questions={questions}
          onApplyChecks={(next) => {
            setQuestions(next);
            markDirty();
          }}
        />
      )}

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic Info</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          disabled={!canEdit}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            markDirty();
          }}
          disabled={!canEdit}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </section>

      <AudienceTargeting
        value={audience}
        onChange={(next) => {
          setAudience(next);
          markDirty();
        }}
        showReputation={false}
        disabled={!canEdit}
      />

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minimum Reputation</h2>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={minReputation}
          onChange={(e) => {
            setMinReputation(Number(e.target.value));
            markDirty();
          }}
          disabled={!canEdit}
          className="w-full"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions ({questions.length})</h2>

        {questions.map((q, index) => (
          canEdit ? (
            <QuestionEditor
              key={index}
              question={q}
              index={index}
              onChange={(next) => updateQuestion(index, next)}
              onRemove={() => removeQuestion(index)}
              jumpTargets={questions
                .map((qq, idx) => ({ question: qq, idx }))
                .filter(({ idx }) => idx !== index)
                .map(({ question: qq, idx }) => ({ index: idx, title: qq.title }))}
              ratingSiblings={questions
                .map((qq, idx) => ({ q: qq, idx }))
                .filter(({ q: qq, idx }) => qq.type === 'rating' && idx !== index)
                .map(({ q: qq, idx }) => ({ index: idx, title: qq.title }))}
            />
          ) : (
            <div key={index} className="rounded-lg border border-border p-4 text-sm">
              <span className="text-xs text-muted-foreground">Q{index + 1} �P {q.type}</span>
              <p className="mt-1 font-medium">{q.title}</p>
            </div>
          )
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            + Add Question
          </button>
        )}
      </section>
    </main>
  );
}
