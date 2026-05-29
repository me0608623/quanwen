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
import { QuestionBlockList } from '@/components/survey-editor/question-block-list';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { SurveyEditorShell } from '@/components/survey-editor/survey-editor-shell';
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
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!survey) return;
    if (dirty && initialized) return; // don't overwrite unsaved edits
    setTitle(survey.title);
    setDescription(survey.description ?? '');
    setQuestions(survey.questions);
    setMinReputation(Number(survey.audienceCriteria?.minReputationScore ?? 0));
    setAudience(survey.audienceCriteria ?? {});
    setInitialized(true);
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
      alert('問卷已成功發佈！');
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
    // Adjust selected index
    setSelectedQuestionIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
    markDirty();
  };

  const addQuestion = (type: SurveyQuestion['type'] = 'single_choice') => {
    let newIndex = 0;
    setQuestions((prev) => {
      const newQ: SurveyQuestion = {
        type,
        title: '',
        sortOrder: prev.length,
        isRequired: true,
        ...(type === 'single_choice' || type === 'multiple_choice'
          ? { options: [{ id: crypto.randomUUID(), label: '', sortOrder: 0 }, { id: crypto.randomUUID(), label: '', sortOrder: 1 }] }
          : {}),
      };
      newIndex = prev.length;
      return [...prev, newQ];
    });
    setSelectedQuestionIndex(newIndex);
    markDirty();
  };

  const handleReorder = (reordered: SurveyQuestion[]) => {
    setQuestions(reordered);
    setSelectedQuestionIndex(null);
    markDirty();
  };

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading survey...</div>;
  if (!survey) return <div className="p-10 text-sm text-destructive">Survey not found.</div>;

  // ─── Sidebar: Questions tab content ────────────────────────────
  const questionsSidebar = (
    <QuestionBlockList
      questions={questions}
      canEdit={canEdit}
      onReorder={handleReorder}
      onDelete={removeQuestion}
      onAdd={addQuestion}
      selectedIndex={selectedQuestionIndex ?? undefined}
      onSelect={setSelectedQuestionIndex}
    />
  );

  // ─── Sidebar: Settings tab content ─────────────────────────────
  const settingsSidebar = (
    <div className="space-y-4 p-3">
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Target Audience
        </h3>
        <AudienceTargeting
          value={audience}
          onChange={(next) => {
            setAudience(next);
            markDirty();
          }}
          showReputation={false}
          disabled={!canEdit}
        />
      </div>

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Minimum Reputation
        </h3>
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
        <span className="text-xs text-muted-foreground">{minReputation}</span>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-md border border-destructive/30 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          Delete Survey
        </button>
      )}
    </div>
  );

  // ─── Determine what to show in center content ──────────────────
  const centerContent = (() => {
    // If a specific question is selected, show its editor
    if (selectedQuestionIndex !== null && selectedQuestionIndex < questions.length) {
      const q = questions[selectedQuestionIndex];
      return canEdit ? (
        <QuestionEditor
          question={q}
          index={selectedQuestionIndex}
          onChange={(next) => updateQuestion(selectedQuestionIndex, next)}
          onRemove={() => removeQuestion(selectedQuestionIndex)}
          jumpTargets={questions
            .map((qq, idx) => ({ question: qq, idx }))
            .filter(({ idx }) => idx !== selectedQuestionIndex)
            .map(({ question: qq, idx }) => ({ index: idx, title: qq.title }))}
          ratingSiblings={questions
            .map((qq, idx) => ({ q: qq, idx }))
            .filter(({ q: qq, idx }) => qq.type === 'rating' && idx !== selectedQuestionIndex)
            .map(({ q: qq, idx }) => ({ index: idx, title: qq.title }))}
        />
      ) : (
        <div className="rounded-lg border border-border p-4 text-sm">
          <span className="text-xs text-muted-foreground">Q{selectedQuestionIndex + 1} — {q.type}</span>
          <p className="mt-1 font-medium">{q.title}</p>
        </div>
      );
    }

    // Default: show all content (overview mode)
    return (
      <div className="space-y-6">
        {/* Budget warning */}
        {canEdit && budgetCheck && !budgetCheck.sufficient && budgetCheck.requiredAmount > 0 && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            Insufficient budget to publish. Required: NT${budgetCheck.requiredAmount.toLocaleString()}, wallet: NT$
            {budgetCheck.walletBalance.toLocaleString()}. <Link href="/wallet" className="underline">Top up wallet</Link>.
          </div>
        )}

        {/* AI Draft panel */}
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

        {/* AI Improve */}
        {survey.questions.length > 0 && <AiImprovePanel surveyId={survey.id} />}

        {/* Anti-cheat */}
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

        {/* Basic Info section */}
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

        {/* Questions section */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Questions ({questions.length})
          </h2>

          {questions.map((q, index) =>
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
                <span className="text-xs text-muted-foreground">Q{index + 1} — {q.type}</span>
                <p className="mt-1 font-medium">{q.title}</p>
              </div>
            ),
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => addQuestion('single_choice')}
              className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              + Add Question
            </button>
          )}
        </section>
      </div>
    );
  })();

  return (
    <>
      <SurveyEditorShell
        surveyTitle={title}
        onTitleChange={(t) => {
          setTitle(t);
          markDirty();
        }}
        canEdit={canEdit}
        statusLabel={STATUS_LABELS[survey.status] ?? survey.status}
        dirty={dirty}
        savePending={updateSurvey.isPending}
        publishPending={publishSurvey.isPending}
        onSave={handleSave}
        onPublish={handlePublish}
        onBack={() => router.push('/dashboard')}
        questionsSidebar={questionsSidebar}
        settingsSidebar={settingsSidebar}
        previewOpen={showPreview}
        onPreviewToggle={() => setShowPreview((prev) => !prev)}
        previewPane={
          <SurveyPreviewPlayer
            title={livePreviewDraft.title}
            description={livePreviewDraft.description}
            questions={livePreviewDraft.questions}
          />
        }
      >
        {centerContent}
      </SurveyEditorShell>

      {/* Full-screen preview modal */}
      <SurveyPreviewModal
        title={livePreviewDraft.title}
        description={livePreviewDraft.description}
        questions={livePreviewDraft.questions}
        open={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </>
  );
}
