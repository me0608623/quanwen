'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
import { AudienceTargeting, ReputationInfoIcon } from '@/components/survey-editor/audience-targeting';
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
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { usePricingAdvice } from '@/hooks/use-pricing';
import { estimateFillMinutes } from '@/lib/fill-time';
import { lotteryDrawRule } from '@/lib/lottery-display';
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
  const searchParams = useSearchParams();
  // 已發布問卷的「資訊編輯模式」：可改標題/說明/圖片/樣式/感謝頁/受眾，題目與獎勵鎖定
  const editInfoMode = searchParams.get('edit') === '1';
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
  // 結束設定（感謝頁面）
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [thankYouImages, setThankYouImages] = useState<string[]>([]);
  const [thankYouRedirectUrl, setThankYouRedirectUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!survey) return;
    // 已發布問卷帶 ?edit=1 → 進入「資訊編輯模式」（不轉跳統計頁）
    if (survey.status === 'closed' || (survey.status === 'published' && !editInfoMode)) {
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
    setThankYouMessage(survey.thankYouMessage ?? '');
    setThankYouImages(survey.thankYouImages ?? []);
    setThankYouRedirectUrl(survey.thankYouRedirectUrl ?? '');
    setInitialized(true);
  }, [dirty, initialized, router, survey, editInfoMode]);

  const canEdit = survey?.status === 'draft' || survey?.status === 'rejected';
  // 資訊編輯模式（已發布）：標題/說明/圖片/樣式/感謝頁/受眾可改；題目與獎勵鎖定
  const isPublishedEditing = survey?.status === 'published' && editInfoMode;
  const canEditInfo = canEdit || isPublishedEditing;
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

  useUnsavedChangesGuard(dirty);

  const showAxiosError = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { message?: string } } };
    alert(e?.response?.data?.message ?? fallback);
  };

  const handleSave = async (): Promise<boolean> => {
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
      if (isPublishedEditing) {
        // 已發布問卷：只送資訊類白名單欄位（題目/獎勵/排程鎖定，後端亦會擋）
        await updateSurvey.mutateAsync({
          title, description, audienceCriteria, theme, coverImageUrl, welcomeImages,
          thankYouMessage: thankYouMessage.trim() || undefined,
          thankYouImages,
          thankYouRedirectUrl: thankYouRedirectUrl.trim() || undefined,
        });
      } else {
        await updateSurvey.mutateAsync({
          title, description, questions, audienceCriteria, theme, coverImageUrl, welcomeImages,
          thankYouMessage: thankYouMessage.trim() || undefined,
          thankYouImages,
          thankYouRedirectUrl: thankYouRedirectUrl.trim() || undefined,
          ...rewardFields, ...scheduleFields,
        });
      }
      setDirty(false);
      return true;
    } catch (err) {
      showAxiosError(err, '儲存失敗，請稍後再試。');
      return false;
    }
  };

  // Cmd/Ctrl+S 快速儲存草稿
  useEffect(() => {
    if (!canEditInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (dirty && !updateSurvey.isPending) handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditInfo, dirty, updateSurvey.isPending]);

  const handlePublish = async () => {
    try {
      // 發布的是「伺服器上的」問卷 — 有未儲存變更（含一鍵補上的抽獎說明）先存再發布
      if (dirty) {
        const saved = await handleSave();
        if (!saved) return;
      }
      await publishSurvey.mutateAsync(id);
      setShowPublishConfirm(false);
      // Don't use alert() — it blocks Playwright and delays React re-render.
      // The UI updates via TanStack query invalidation (status badge changes).
    } catch (err) {
      showAxiosError(err, '發布問卷失敗，請稍後再試。');
    }
  };

  // 抽獎問卷：問卷說明應寫明「此問卷為抽獎項目、獎項、幾份、如何抽」— 一鍵補上
  const descriptionMentionsLottery = description.includes('抽獎');
  const appendLotteryNotice = () => {
    const drawRule = lotteryDrawRule({
      lotteryWinnerCount,
      lotteryDrawMode,
      lotteryDrawAt: lotteryDrawMode === 'scheduled' ? localInputToIso(lotteryDrawAt) : null,
    });
    const notice = `【抽獎說明】此問卷為抽獎項目：完成填答並通過品質審核即獲得抽獎資格。獎項：${lotteryPrize.trim() || '（請填寫獎項）'}，共 ${lotteryWinnerCount} 份。開獎方式：${drawRule}，中獎將以站內通知告知。`;
    setDescription((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${notice}` : notice));
    markDirty();
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

  const addQuestion = (
    type: SurveyQuestion['type'] = 'single_choice',
    presetConfig?: Record<string, unknown>,
  ) => {
    let newIndex = 0;
    setQuestions((prev) => {
      const isYesNo = presetConfig?.variant === 'yes_no';
      const isChoice = type === 'single_choice' || type === 'multiple_choice';
      const options = isYesNo
        ? [{ id: 'yes', label: '是', sortOrder: 0 }, { id: 'no', label: '否', sortOrder: 1 }]
        : isChoice
          ? [{ id: crypto.randomUUID(), label: '', sortOrder: 0 }, { id: crypto.randomUUID(), label: '', sortOrder: 1 }]
          : undefined;

      let config: Record<string, unknown> | undefined = presetConfig ? { ...presetConfig } : undefined;
      if (type === 'matrix') {
        const preMatrix = (presetConfig?.matrix as { multiple?: boolean } | undefined) ?? {};
        config = {
          matrix: {
            rows: [''],
            columns: ['非常不同意', '不同意', '普通', '同意', '非常同意'],
            ...(preMatrix.multiple ? { multiple: true } : {}),
          },
        };
      }

      const newQ: SurveyQuestion = {
        type,
        title: '',
        sortOrder: prev.length,
        isRequired: true,
        ...(options ? { options } : {}),
        ...(config ? { config } : {}),
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
  if (survey.status === 'closed' || (survey.status === 'published' && !editInfoMode)) {
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
        onUpdateQuestion={(idx, next) => updateQuestion(idx, next)}
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
      disabled={!canEditInfo}
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
          disabled={!canEditInfo}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            最低信譽分
          </h3>
          <ReputationInfoIcon />
        </div>
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
          disabled={!canEditInfo}
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
    // 結束設定（感謝頁面）面板：selectedQuestionIndex === -2
    if (selectedQuestionIndex === -2) {
      return (
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold">🏁 結束設定</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              填答者完成問卷後看到的感謝頁面。可自訂文字、插入圖片，或設定完成後導向的網址。留空則使用預設感謝畫面。
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">感謝文字（選填）</label>
            <textarea
              value={thankYouMessage}
              onChange={(e) => { setThankYouMessage(e.target.value); markDirty(); }}
              disabled={!canEditInfo}
              maxLength={1000}
              placeholder="例：感謝你的填寫！你的意見對我們非常重要。"
              className="h-28 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{thankYouMessage.length}/1000</p>
          </div>

          {canEditInfo && (
            <div>
              <label className="mb-1 block text-sm font-medium">感謝頁圖片（選填，依序顯示）</label>
              <WelcomeImagesEditor
                value={thankYouImages}
                onChange={(next) => { setThankYouImages(next); markDirty(); }}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">完成後導向網址（選填）</label>
            <input
              type="url"
              value={thankYouRedirectUrl}
              onChange={(e) => { setThankYouRedirectUrl(e.target.value); markDirty(); }}
              disabled={!canEditInfo}
              placeholder="https://example.com/thanks"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              設定後感謝頁會顯示「前往」按鈕讓填答者跳轉（不會強制自動跳轉）。僅支援 http / https。
            </p>
          </div>
        </div>
      );
    }

    if (selectedQuestionIndex !== null && selectedQuestionIndex >= 0 && selectedQuestionIndex < questions.length) {
      const q = questions[selectedQuestionIndex];
      return canEdit ? (
        <QuestionEditor
          question={q}
          index={selectedQuestionIndex}
          onChange={(next) => updateQuestion(selectedQuestionIndex, next)}
          onRemove={() => removeQuestion(selectedQuestionIndex)}
          onDuplicate={() => duplicateQuestion(selectedQuestionIndex)}
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
        {/* 已發布資訊編輯模式提示 */}
        {isPublishedEditing && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            ✏️ <span className="font-semibold">資訊編輯模式</span> —
            可修改標題、說明、圖片、樣式、感謝頁與受眾條件；
            <span className="font-semibold">題目與獎勵已鎖定</span>（修改會使既有填答失效）。
            改完按右上角「儲存變更」立即生效。
          </div>
        )}

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
            disabled={!canEditInfo}
            aria-label="問卷標題"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              markDirty();
            }}
            disabled={!canEditInfo}
            rows={3}
            maxLength={2000}
            aria-label="問卷說明"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          {canEdit && description.length > 1700 && (
            <p className="-mt-1 text-right text-[11px] text-muted-foreground">{description.length} / 2000</p>
          )}
          {canEditInfo && (
            <ImageUploader
              value={coverImageUrl}
              onChange={(url) => {
                setCoverImageUrl(url);
                markDirty();
              }}
              label="封面圖片（顯示於任務卡片與問卷歡迎頁）"
            />
          )}
          {canEditInfo && (
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
                onDuplicate={() => duplicateQuestion(index)}
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
        canEdit={canEditInfo}
        canPublish={canEdit}
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
            coverImageUrl={livePreviewDraft.coverImageUrl}
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
        coverImageUrl={livePreviewDraft.coverImageUrl}
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
                發布後問卷將立即上架開放填答；AI 會在背景進行品質掃描並提供改善建議。
              </p>

              {scheduledPublishAt && new Date(scheduledPublishAt).getTime() > Date.now() && (
                <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                  🕒 此問卷已排程於 {new Date(scheduledPublishAt).toLocaleString('zh-TW')} 自動發布。立即發布將略過排程、馬上上架。
                </p>
              )}

              {rewardMode === 'lottery' && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <p className="font-bold">🎁 此問卷為抽獎問卷</p>
                  <ul className="mt-1.5 space-y-1">
                    <li>• 獎項：<b>{lotteryPrize || '（尚未填寫，請先設定獎項）'}</b></li>
                    <li>• 名額：<b>{lotteryWinnerCount} 名</b>中獎者</li>
                    <li>
                      • 開獎方式：<b>
                        {lotteryDrawMode === 'when_full'
                          ? '收滿目標份數後自動開獎'
                          : lotteryDrawMode === 'scheduled'
                            ? `指定時間開獎（${lotteryDrawAt ? new Date(lotteryDrawAt).toLocaleString('zh-TW') : '未設定時間'}）`
                            : '收滿後由你手動開獎'}
                      </b>
                    </li>
                  </ul>
                  <p className="mt-1.5 text-amber-700">
                    發布即代表你承諾於開獎後 7 日內交付獎品；填答者會在填答頁看到以上抽獎資訊，平台將追蹤履約。
                  </p>
                  {descriptionMentionsLottery ? (
                    <p className="mt-2 text-emerald-700">✓ 問卷說明已提及抽獎資訊。</p>
                  ) : (
                    <div className="mt-2 rounded-md border border-amber-300 bg-white/70 px-2.5 py-2">
                      <p className="font-semibold">⚠️ 問卷說明尚未提及抽獎</p>
                      <p className="mt-0.5">
                        請在問卷說明寫明：<b>此問卷為抽獎項目、獎項是什麼、共幾份、如何抽出</b>，讓填答者一眼看懂。
                      </p>
                      <button
                        type="button"
                        onClick={appendLotteryNotice}
                        className="mt-1.5 rounded border border-amber-400 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        一鍵補上抽獎說明
                      </button>
                    </div>
                  )}
                </div>
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
                  disabled={insufficient || noQuestions || publishSurvey.isPending || updateSurvey.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {publishSurvey.isPending || updateSurvey.isPending
                    ? '發布中…'
                    : dirty
                      ? '儲存並發布'
                      : '確認發布'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
