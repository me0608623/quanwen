'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  type AudienceCriteria,
  type DeadlineTier,
  type SurveyQuestion,
  type SurveyTheme,
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
import { ImageUploader } from '@/components/survey-editor/image-uploader';
import { WelcomeImagesEditor } from '@/components/survey-editor/welcome-images-editor';
import { QuestionBlockList } from '@/components/survey-editor/question-block-list';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { RewardsPanel } from '@/components/survey-editor/rewards-panel';
import { SurveyEditorShell } from '@/components/survey-editor/survey-editor-shell';
import { SurveyPreviewModal } from '@/components/survey-editor/survey-preview-modal';
import { SurveyPreviewPlayer } from '@/components/survey-editor/survey-preview-player';
import { SurveyStylePanel } from '@/components/survey-editor/survey-style-panel';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePricingAdvice } from '@/hooks/use-pricing';
import { estimateFillMinutes } from '@/lib/fill-time';
import { SURVEY_TEMPLATES } from '@/lib/survey-templates';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '審核中',
  published: '已發布',
  paused: '已暫停',
  closed: '已關閉',
  rejected: '已退回',
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '單選',
  multiple_choice: '多選',
  text: '問答',
  rating: '評分',
  numeric: '數字',
  yes_no: '是/否',
  dropdown: '下拉選單',
};

// ISO ↔ <input type="datetime-local"> 本地時間字串轉換
const isoToLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const localInputToIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);

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
  const [rewardPoints, setRewardPoints] = useState(0);
  const [rewardMode, setRewardMode] = useState<'fixed' | 'lottery'>('fixed');
  const [lotteryPrize, setLotteryPrize] = useState('');
  const [lotteryWinnerCount, setLotteryWinnerCount] = useState(1);
  const [lotteryDrawMode, setLotteryDrawMode] = useState<'when_full' | 'scheduled' | 'manual'>('when_full');
  const [lotteryDrawAt, setLotteryDrawAt] = useState('');
  const [lotteryTermsAccepted, setLotteryTermsAccepted] = useState(false);
  const [targetCount, setTargetCount] = useState(100);
  const [deadlineTier, setDeadlineTier] = useState<DeadlineTier>('standard');
  const [scheduledPublishAt, setScheduledPublishAt] = useState('');
  const [autoCloseAt, setAutoCloseAt] = useState('');
  const [autoCloseAfterN, setAutoCloseAfterN] = useState<number | ''>('');
  const [audience, setAudience] = useState<AudienceCriteria>({});
  const [theme, setTheme] = useState<SurveyTheme>({});
  const [coverImageUrl, setCoverImageUrl] = useState<string | undefined>(undefined);
  const [welcomeImages, setWelcomeImages] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!survey) return;
    if (survey.status === 'published' || survey.status === 'closed') {
      router.replace(`/dashboard/surveys/${survey.id}/stats`);
      return;
    }
    if (dirty && initialized) return; // don't overwrite unsaved edits
    setTitle(survey.title);
    setDescription(survey.description ?? '');
    setQuestions(survey.questions);
    setMinReputation(Number(survey.audienceCriteria?.minReputationScore ?? 0));
    setRewardPoints(survey.baseRewardPoints ?? survey.rewardPoints ?? 0);
    setRewardMode(survey.rewardMode ?? 'fixed');
    setLotteryPrize(survey.lotteryPrize ?? '');
    setLotteryWinnerCount(survey.lotteryWinnerCount ?? 1);
    setLotteryDrawMode(survey.lotteryDrawMode ?? 'when_full');
    setLotteryDrawAt(isoToLocalInput(survey.lotteryDrawAt));
    setLotteryTermsAccepted(!!survey.lotteryTermsAcceptedAt);
    setTargetCount(survey.targetCount ?? 100);
    setDeadlineTier(survey.deadlineTier ?? 'standard');
    setScheduledPublishAt(isoToLocalInput(survey.scheduledPublishAt));
    setAutoCloseAt(isoToLocalInput(survey.autoCloseAt));
    setAutoCloseAfterN(survey.autoCloseAfterN ?? '');
    setAudience(survey.audienceCriteria ?? {});
    setTheme(survey.theme ?? {});
    setCoverImageUrl(survey.coverImageUrl ?? undefined);
    setWelcomeImages(survey.welcomeImages ?? []);
    setInitialized(true);
  }, [dirty, initialized, router, survey]);

  const canEdit = survey?.status === 'draft' || survey?.status === 'rejected';
  const livePreviewDraft = useDebouncedValue({ title, description, questions, theme, coverImageUrl }, 350);

  // 定價顧問：依題目估算建議單份獎勵（debounced，僅 standard 問卷）
  const pricingAdvice = usePricingAdvice();
  const adviseMutate = pricingAdvice.mutate;
  const questionsSig = JSON.stringify(
    questions.map((q) => [q.type, q.isRequired, q.options?.length ?? 0, q.config]),
  );
  useEffect(() => {
    if (!initialized || survey?.type === 'mutual' || questions.length === 0) return;
    const handle = setTimeout(() => {
      adviseMutate({
        questions: questions.map((q) => ({
          type: q.type,
          isRequired: q.isRequired,
          options: q.options,
          config: q.config,
        })),
        introChars: description.length,
      });
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsSig, initialized, survey?.type, description, adviseMutate]);

  const markDirty = () => setDirty(true);
  const markLotteryChanged = () => {
    setLotteryTermsAccepted(false);
    markDirty();
  };

  // 有未儲存變更時，關閉/重整分頁前提示（避免誤丟編輯）
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const showAxiosError = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { message?: string } } };
    alert(e?.response?.data?.message ?? fallback);
  };

  const handleSave = async () => {
    const audienceCriteria = {
      ...audience,
      minReputationScore: minReputation > 0 ? minReputation : undefined,
    };

    const rewardFields =
      survey?.type === 'mutual'
        ? {}
        : {
            rewardPoints,
            rewardMode,
            targetCount,
            deadlineTier,
            ...(rewardMode === 'lottery'
              ? {
                  lotteryPrize: lotteryPrize.trim(),
                  lotteryWinnerCount,
                  lotteryDrawMode,
                  lotteryDrawAt: lotteryDrawMode === 'scheduled' ? localInputToIso(lotteryDrawAt) ?? undefined : undefined,
                  lotteryTermsAccepted,
                }
              : {}),
          };

    const scheduleFields = {
      scheduledPublishAt: localInputToIso(scheduledPublishAt),
      autoCloseAt: localInputToIso(autoCloseAt),
      autoCloseAfterN: autoCloseAfterN === '' ? null : Number(autoCloseAfterN),
    };

    try {
      await updateSurvey.mutateAsync({ title, description, questions, audienceCriteria, theme, coverImageUrl, welcomeImages, ...rewardFields, ...scheduleFields });
      setDirty(false);
    } catch (err) {
      showAxiosError(err, '儲存草稿失敗，請稍後再試。');
    }
  };

  // Cmd/Ctrl+S 快速儲存草稿
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (dirty && !updateSurvey.isPending) handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, dirty, updateSurvey.isPending]);

  const handlePublish = async () => {
    try {
      await publishSurvey.mutateAsync(id);
      setShowPublishConfirm(false);
      // Don't use alert() — it blocks Playwright and delays React re-render.
      // The UI updates via TanStack query invalidation (status badge changes).
    } catch (err) {
      showAxiosError(err, '發布問卷失敗，請稍後再試。');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除這份草稿問卷嗎？')) return;

    try {
      await deleteSurvey.mutateAsync(id);
      router.push('/dashboard');
    } catch (err) {
      showAxiosError(err, '刪除問卷失敗，請稍後再試。');
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

  const duplicateQuestion = (index: number) => {
    setQuestions((prev) => {
      const src = prev[index];
      if (!src) return prev;
      // 深拷貝 + 重新產生 option id，避免共用 id
      const copy: SurveyQuestion = {
        ...src,
        id: undefined,
        title: src.title ? `${src.title}（複本）` : src.title,
        options: src.options?.map((o) => ({ ...o, id: crypto.randomUUID() })),
      };
      const next = [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      return next.map((q, idx) => ({ ...q, sortOrder: idx }));
    });
    setSelectedQuestionIndex(index + 1);
    markDirty();
  };

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">載入問卷中…</div>;
  if (!survey) return <div className="p-10 text-sm text-destructive">找不到問卷。</div>;
  if (survey.status === 'published' || survey.status === 'closed') {
    return <div className="p-10 text-sm text-muted-foreground">正在開啟問卷分析工作台…</div>;
  }

  // ─── Sidebar: Questions tab content ────────────────────────────
  const questionsSidebar = (
    <div>
      {questions.length > 0 && (
        <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          共 {questions.length} 題（{questions.filter((qq) => qq.isRequired).length} 必填）· 預估填答約 {estimateFillMinutes(questions.length)} 分鐘
        </div>
      )}
      {canEdit && (questions.length === 0 || (questions.length === 1 && !questions[0].title)) && (
        <div className="border-b border-border px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">從範本快速建立</p>
          <div className="flex flex-wrap gap-1.5">
            {SURVEY_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setQuestions(t.build());
                  setSelectedQuestionIndex(null);
                  markDirty();
                }}
                className="rounded-full border border-[#126b8a]/30 bg-[#126b8a]/5 px-2.5 py-1 text-[11px] font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
                title={t.description}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <QuestionBlockList
        questions={questions}
        canEdit={canEdit}
        onReorder={handleReorder}
        onDelete={removeQuestion}
        onAdd={addQuestion}
        onDuplicate={duplicateQuestion}
        selectedIndex={selectedQuestionIndex ?? -1}
        onSelect={(idx) => setSelectedQuestionIndex(idx === -1 ? null : idx)}
      />
    </div>
  );

  // ─── Sidebar: Styling tab content ──────────────────────────────
  const stylingSidebar = (
    <SurveyStylePanel
      value={theme}
      onChange={(next) => {
        setTheme(next);
        markDirty();
      }}
      disabled={!canEdit}
    />
  );

  // ─── Sidebar: Rewards tab content ──────────────────────────────
  const rewardsSidebar = (
    <RewardsPanel
      isMutual={survey.type === 'mutual'}
      rewardPoints={rewardPoints}
      rewardMode={rewardMode}
      lotteryPrize={lotteryPrize}
      lotteryWinnerCount={lotteryWinnerCount}
      lotteryDrawMode={lotteryDrawMode}
      lotteryDrawAt={lotteryDrawAt}
      lotteryTermsAccepted={lotteryTermsAccepted}
      targetCount={targetCount}
      deadlineTier={deadlineTier}
      onRewardChange={(v) => {
        setRewardPoints(v);
        markDirty();
      }}
      onTargetChange={(v) => {
        setTargetCount(v);
        markDirty();
      }}
      onRewardModeChange={(v) => {
        setRewardMode(v);
        if (v === 'lottery') setLotteryTermsAccepted(false);
        markDirty();
      }}
      onLotteryPrizeChange={(v) => {
        setLotteryPrize(v);
        markLotteryChanged();
      }}
      onLotteryWinnerCountChange={(v) => {
        setLotteryWinnerCount(v);
        markLotteryChanged();
      }}
      onLotteryDrawModeChange={(v) => {
        setLotteryDrawMode(v);
        markLotteryChanged();
      }}
      onLotteryDrawAtChange={(v) => {
        setLotteryDrawAt(v);
        markLotteryChanged();
      }}
      onLotteryTermsAcceptedChange={(v) => {
        setLotteryTermsAccepted(v);
        markDirty();
      }}
      onTierChange={(v) => {
        setDeadlineTier(v);
        markDirty();
      }}
      pricingAdvice={pricingAdvice.data}
      pricingLoading={pricingAdvice.isPending}
      disabled={!canEdit}
    />
  );

  // ─── Sidebar: Settings tab content ─────────────────────────────
  const settingsSidebar = (
    <div className="space-y-4 p-3">
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          受眾鎖定
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
          最低信譽分
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

      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          排程與自動關閉
        </h3>
        <label className="mb-1 block text-xs font-medium">排程發布時間</label>
        <input
          type="datetime-local"
          value={scheduledPublishAt}
          onChange={(e) => {
            setScheduledPublishAt(e.target.value);
            markDirty();
          }}
          disabled={!canEdit}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs disabled:opacity-60"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">留空則需手動發布。</p>

        <label className="mb-1 mt-3 block text-xs font-medium">自動關閉時間</label>
        <input
          type="datetime-local"
          value={autoCloseAt}
          onChange={(e) => {
            setAutoCloseAt(e.target.value);
            markDirty();
          }}
          disabled={!canEdit}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs disabled:opacity-60"
        />

        <label className="mb-1 mt-3 block text-xs font-medium">達 N 份自動關閉</label>
        <input
          type="number"
          min={1}
          placeholder="不限"
          value={autoCloseAfterN}
          onChange={(e) => {
            setAutoCloseAfterN(e.target.value === '' ? '' : Number(e.target.value));
            markDirty();
          }}
          disabled={!canEdit}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs disabled:opacity-60"
        />
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-md border border-destructive/30 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          刪除問卷
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
          <span className="text-xs text-muted-foreground">Q{selectedQuestionIndex + 1} — {QUESTION_TYPE_LABELS[q.type] ?? q.type}</span>
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
            預算不足，無法發布。需要 NT${budgetCheck.requiredAmount.toLocaleString()}，錢包餘額 NT$
            {budgetCheck.walletBalance.toLocaleString()}。<Link href="/wallet" className="underline">前往儲值</Link>。
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">基本資訊</h2>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            disabled={!canEdit}
            aria-label="問卷標題"
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
            maxLength={2000}
            aria-label="問卷說明"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          {canEdit && description.length > 1700 && (
            <p className="-mt-1 text-right text-[11px] text-muted-foreground">{description.length} / 2000</p>
          )}
          {canEdit && (
            <ImageUploader
              value={coverImageUrl}
              onChange={(url) => {
                setCoverImageUrl(url);
                markDirty();
              }}
              label="封面圖片（顯示於任務卡片與問卷歡迎頁）"
            />
          )}
          {canEdit && (
            <WelcomeImagesEditor
              value={welcomeImages}
              onChange={(next) => {
                setWelcomeImages(next);
                markDirty();
              }}
            />
          )}
        </section>

        {/* Questions section */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            題目（{questions.length} 題）
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
                <span className="text-xs text-muted-foreground">Q{index + 1} — {QUESTION_TYPE_LABELS[q.type] ?? q.type}</span>
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
              + 新增題目
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
        onPublish={() => setShowPublishConfirm(true)}
        onBack={() => {
          if (dirty && !confirm('有未儲存的變更，確定要離開嗎？')) return;
          router.push('/dashboard');
        }}
        questionsSidebar={questionsSidebar}
        stylingSidebar={stylingSidebar}
        rewardsSidebar={rewardsSidebar}
        settingsSidebar={settingsSidebar}
        previewOpen={showPreview}
        onPreviewToggle={() => setShowPreview((prev) => !prev)}
        previewPane={
          <SurveyPreviewPlayer
            title={livePreviewDraft.title}
            description={livePreviewDraft.description}
            questions={livePreviewDraft.questions}
            theme={livePreviewDraft.theme}
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
        theme={livePreviewDraft.theme}
        open={showPreview}
        onClose={() => setShowPreview(false)}
      />

      {/* 發布確認 modal（含預算試算） */}
      {showPublishConfirm && (() => {
        const required = budgetCheck?.requiredAmount ?? 0;
        const noQuestions = questions.length === 0;
        const balance = budgetCheck?.walletBalance ?? 0;
        const insufficient = required > 0 && !!budgetCheck && !budgetCheck.sufficient;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowPublishConfirm(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-foreground">確認發布問卷</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                發布後問卷將進入審核，通過後開放填答。
              </p>

              {scheduledPublishAt && new Date(scheduledPublishAt).getTime() > Date.now() && (
                <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                  🕒 此問卷已排程於 {new Date(scheduledPublishAt).toLocaleString('zh-TW')} 自動發布。立即發布將略過排程、馬上送審。
                </p>
              )}

              {required > 0 ? (
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">預估鎖定預算</span>
                    <span className="font-semibold">NT${required.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">錢包餘額</span>
                    <span className="font-semibold">NT${balance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">發布後餘額</span>
                    <span className={`font-semibold ${insufficient ? 'text-destructive' : 'text-foreground'}`}>
                      NT${(balance - required).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  此問卷不需鎖定預算（互惠 / 無金錢獎勵）。
                </div>
              )}

              {insufficient && (
                <p className="mt-3 text-xs text-destructive">
                  錢包餘額不足，請先{' '}
                  <Link href="/wallet" className="underline">前往儲值</Link>。
                </p>
              )}

              {noQuestions && (
                <p className="mt-3 text-xs text-destructive">問卷至少需要一道題目才能發布。</p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishConfirm(false)}
                  className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={insufficient || noQuestions || publishSurvey.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {publishSurvey.isPending ? '發布中…' : '確認發布'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
