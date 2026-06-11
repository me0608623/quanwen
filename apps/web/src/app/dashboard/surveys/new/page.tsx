'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSurvey, SurveyQuestion, AiDraftResult, SURVEY_CATEGORY_LABELS, DEADLINE_TIER_OPTIONS, type SurveyCategory, type AudienceCriteria, type DeadlineTier } from '@/hooks/use-surveys';
import { usePricingAdvice } from '@/hooks/use-pricing';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { AiDraftPanel } from '@/components/survey-editor/ai-draft-panel';
import { SURVEY_TEMPLATES, type SurveyTemplate } from '@/lib/survey-templates';
import { PricingAdviceCard } from '@/components/survey-editor/pricing-advice-card';
import { AudienceTargeting } from '@/components/survey-editor/audience-targeting';
import { SurveyPreviewPlayer } from '@/components/survey-editor/survey-preview-player';
import { ImageUploader } from '@/components/survey-editor/image-uploader';
import { WelcomeImagesEditor } from '@/components/survey-editor/welcome-images-editor';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

function localDateTimeInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const LOTTERY_PRIZE_EXAMPLES = [
  '饗食天堂平日晚餐券 2 張',
  '星巴克飲料券 10 份',
  '超商禮券 NT$500',
];

const defaultQuestion = (): SurveyQuestion => ({
  type: 'single_choice',
  title: '',
  sortOrder: 0,
  isRequired: true,
  options: [
    { id: crypto.randomUUID(), label: '', sortOrder: 0 },
    { id: crypto.randomUUID(), label: '', sortOrder: 1 },
  ],
});

export default function NewSurveyPage() {
  const router = useRouter();
  const createSurvey = useCreateSurvey();

  const [type, setType] = useState<'standard' | 'mutual'>('standard');
  const [category, setCategory] = useState<SurveyCategory | ''>('');
  const [aiReviewEnabled, setAiReviewEnabled] = useState(true);
  const [externalUrl, setExternalUrl] = useState('');
  // 標準問卷：是否為「外部問卷」（Google 表單等，填答者跳轉填寫，站內不出題）
  const [isExternal, setIsExternal] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(10);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | undefined>(undefined);
  const [welcomeImages, setWelcomeImages] = useState<string[]>([]);
  const [rewardMode, setRewardMode] = useState<'fixed' | 'lottery'>('fixed');
  const [rewardPoints, setRewardPoints] = useState(0);
  const [lotteryPrize, setLotteryPrize] = useState('');
  const [lotteryWinnerCount, setLotteryWinnerCount] = useState(1);
  const [lotteryDrawMode, setLotteryDrawMode] = useState<'when_full' | 'scheduled' | 'manual'>('when_full');
  const [lotteryDrawAt, setLotteryDrawAt] = useState('');
  const [lotteryTermsAccepted, setLotteryTermsAccepted] = useState(false);
  const [deadlineTier, setDeadlineTier] = useState<DeadlineTier>('standard');
  const [targetCount, setTargetCount] = useState(100);
  const [audience, setAudience] = useState<AudienceCriteria>({});
  const [questions, setQuestions] = useState<SurveyQuestion[]>([defaultQuestion()]);
  const savedRef = useRef(false);

  const hasContent =
    title.trim() !== '' ||
    description.trim() !== '' ||
    externalUrl.trim() !== '' ||
    rewardPoints > 0 ||
    lotteryPrize.trim() !== '' ||
    questions.some((q) => (q.title ?? '').trim() !== '');

  useUnsavedChangesGuard(hasContent && !savedRef.current);
  const livePreviewDraft = useDebouncedValue({ title, description, questions, coverImageUrl }, 300);

  // 定價顧問：依題目估算「建議單份獎勵」（debounced；發問卷者完全自訂）
  const pricingAdvice = usePricingAdvice();
  const adviseMutate = pricingAdvice.mutate;
  const questionsSig = JSON.stringify(
    questions.map((q) => [q.type, q.isRequired, q.options?.length ?? 0, q.config]),
  );
  useEffect(() => {
    if (type !== 'standard') return;
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
  }, [questionsSig, type, description, adviseMutate]);

  const applyAiDraft = (draft: AiDraftResult) => {
    setTitle(draft.title);
    setDescription(draft.description ?? '');
    setQuestions(
      draft.questions.map((q, i) => ({ ...q, sortOrder: i })),
    );
  };

  const applyTemplate = (t: SurveyTemplate) => {
    if (!title) setTitle(t.title);
    if (!description) setDescription(t.description);
    setQuestions(t.build());
  };

  const updateQuestion = (i: number, q: SurveyQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? { ...q, sortOrder: i } : old)));
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, sortOrder: idx })));
  };

  // 複製題目：插入到原題下方，標題加「（複本）」供微調；選項重新產 id 避免共用
  const duplicateQuestion = (i: number) => {
    setQuestions((prev) => {
      const src = prev[i];
      if (!src) return prev;
      const copy = {
        ...src,
        id: undefined,
        title: src.title ? `${src.title}（複本）` : src.title,
        options: src.options?.map((o) => ({ ...o, id: crypto.randomUUID() })),
      };
      const next = [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
      return next.map((q, idx) => ({ ...q, sortOrder: idx }));
    });
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { ...defaultQuestion(), sortOrder: prev.length }]);
  };

  const handleSaveDraft = async () => {
    try {
      const survey = await createSurvey.mutateAsync({
        title: title || '未命名問卷',
        description: description || undefined,
        coverImageUrl: coverImageUrl || undefined,
        welcomeImages: welcomeImages.length > 0 ? welcomeImages : undefined,
        type,
        category: category || undefined,
        aiReviewEnabled: type === 'mutual' ? true : aiReviewEnabled,
        externalUrl:
          (type === 'mutual' || (type === 'standard' && isExternal)) && externalUrl.trim()
            ? externalUrl.trim()
            : undefined,
        // 外部問卷由建立者填預估分鐘數（站內問卷依題數自動估算）
        estimatedMinutes: type === 'standard' && isExternal ? estimatedMinutes : undefined,
        rewardPoints: type === 'mutual' ? 0 : rewardPoints,
        rewardMode: type === 'mutual' ? 'fixed' : rewardMode,
        lotteryPrize: type === 'standard' && rewardMode === 'lottery' ? lotteryPrize.trim() : undefined,
        lotteryWinnerCount: type === 'standard' && rewardMode === 'lottery' ? lotteryWinnerCount : undefined,
        lotteryDrawMode: type === 'standard' && rewardMode === 'lottery' ? lotteryDrawMode : undefined,
        lotteryDrawAt: type === 'standard' && rewardMode === 'lottery' && lotteryDrawMode === 'scheduled' && lotteryDrawAt
          ? new Date(lotteryDrawAt).toISOString()
          : undefined,
        lotteryTermsAccepted: type === 'standard' && rewardMode === 'lottery' ? lotteryTermsAccepted : undefined,
        deadlineTier: type === 'mutual' ? 'standard' : deadlineTier,
        targetCount: type === 'mutual' ? 9999 : targetCount,
        // 受眾鎖定只對 standard 有意義（mutual 走配對機制）
        audienceCriteria: type === 'standard' && Object.keys(audience).length > 0 ? audience : undefined,
        // 外部問卷站內不出題
        questions: type === 'standard' && isExternal ? [] : questions,
      });
      savedRef.current = true;
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
          onClick={() => {
            if (hasContent && !savedRef.current && !window.confirm('有未儲存的變更，確定要離開嗎？')) return;
            router.back();
          }}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 返回
        </button>
      </div>

      {/* Type selector */}
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">問卷類型</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => { setType('standard'); setIsExternal(false); }}
            className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
              type === 'standard' && !isExternal
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">💰</span>
              <span className="font-semibold text-sm">標準（付費取樣）</span>
              {type === 'standard' && !isExternal && (
                <span className="ml-auto text-xs font-medium text-primary">✓</span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              站內出題，平台媒合受試者來填寫。發布即上架；需要預算鎖定 + AI 品質掃描。
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setType('mutual'); setIsExternal(false); }}
            className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
              type === 'mutual'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">🤝</span>
              <span className="font-semibold text-sm">互惠（兩人互填）</span>
              {type === 'mutual' && (
                <span className="ml-auto text-xs font-medium text-primary">✓</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              不付錢，系統幫你配對另一個有問卷的人。雙方填完就解鎖看對方填答。
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setType('standard'); setIsExternal(true); }}
            className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
              type === 'standard' && isExternal
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">🔗</span>
              <span className="font-semibold text-sm">外部問卷連結</span>
              {type === 'standard' && isExternal && (
                <span className="ml-auto text-xs font-medium text-primary">✓</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              已用 Google 表單等外部平台。平台只做公布與媒合，填答者跳轉填寫，不出題、不審核。
            </p>
          </button>
        </div>
      </section>

      {!(type === 'standard' && isExternal) && (<>
      {/* AI Draft */}
      <div className="flex gap-3">
        <div className="flex-1">
          <AiDraftPanel onApply={applyAiDraft} />
        </div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/surveys/import')}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent transition-colors"
        >
          📥 匯入表單
        </button>
      </div>

      {/* 範本快速開始 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">或從範本開始：</span>
        {SURVEY_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => applyTemplate(t)}
            className="rounded-full border border-[#126b8a]/30 bg-[#126b8a]/5 px-3 py-1 text-xs font-medium text-[#126b8a] hover:bg-[#126b8a]/10"
            title={t.description}
          >
            {t.name}
          </button>
        ))}
      </div>
      </>)}

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
            aria-label="問卷標題"
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
            aria-label="問卷說明"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* QUA-279: Cover image */}
        <ImageUploader
          value={coverImageUrl}
          onChange={setCoverImageUrl}
          label="封面圖片（顯示於任務卡片與問卷歡迎頁）"
        />

        {/* 歡迎頁多圖 */}
        <WelcomeImagesEditor value={welcomeImages} onChange={setWelcomeImages} />

        <div>
          <label className="mb-1 block text-sm font-medium">分類（選填）</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SurveyCategory | '')}
            aria-label="問卷分類"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— 未分類 —</option>
            {(Object.keys(SURVEY_CATEGORY_LABELS) as SurveyCategory[]).map((k) => (
              <option key={k} value={k}>{SURVEY_CATEGORY_LABELS[k]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            未來 mutual 媒合會優先配對同分類問卷; task list 也可依此篩選。
          </p>
        </div>

        {type === 'standard' && (
          <>
          {isExternal && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <p className="mb-2 text-xs text-sky-800">
                🔗 外部問卷：填答者會在問卷池看到並跳轉到你的外部頁面填寫，平台不出題、不審核。獎勵由你依填答結果自行發放。
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-xs font-medium">外部問卷網址 *</label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    aria-label="外部問卷網址"
                    placeholder="https://forms.gle/..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">預估填寫分鐘 *</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(Math.max(1, Number(e.target.value) || 1))}
                    aria-label="預估填寫分鐘"
                    className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium">回饋方式</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRewardMode('fixed')}
                className={`rounded-lg border-2 p-3 text-left ${rewardMode === 'fixed' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <p className="text-sm font-semibold">每份固定獎勵</p>
                <p className="mt-1 text-xs text-slate-600">每位有效填答者都可取得設定的 NT$ 獎勵。</p>
              </button>
              <button
                type="button"
                onClick={() => setRewardMode('lottery')}
                className={`rounded-lg border-2 p-3 text-left ${rewardMode === 'lottery' ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <p className="text-sm font-semibold">抽獎回饋</p>
                <p className="mt-1 text-xs text-muted-foreground">不必設定每份金額，例如抽饗食天堂餐券或品牌禮券。</p>
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            {rewardMode === 'fixed' && <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">獎勵點數（NT$）</label>
              <input
                type="number"
                min={0}
                max={1000}
                value={rewardPoints}
                onChange={(e) => setRewardPoints(Number(e.target.value))}
                aria-label="獎勵點數（NT$）"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>}
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">目標收集份數</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                aria-label="目標收集份數"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {rewardMode === 'lottery' && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div>
                <label className="mb-1 block text-sm font-medium">抽獎獎品 *</label>
                <input
                  value={lotteryPrize}
                  onChange={(e) => setLotteryPrize(e.target.value)}
                  aria-label="抽獎獎品"
                  placeholder="例如：饗食天堂平日晚餐券 2 張"
                  maxLength={300}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {LOTTERY_PRIZE_EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setLotteryPrize(example)}
                      className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">中獎名額</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={lotteryWinnerCount}
                  onChange={(e) => setLotteryWinnerCount(Number(e.target.value))}
                  aria-label="中獎名額"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">開獎方式</label>
                <select
                  value={lotteryDrawMode}
                  onChange={(e) => setLotteryDrawMode(e.target.value as typeof lotteryDrawMode)}
                  aria-label="開獎方式"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="when_full">問卷收滿後自動開獎並通知</option>
                  <option value="scheduled">指定日期自動開獎並通知</option>
                  <option value="manual">問卷收滿後，由我手動開獎並通知</option>
                </select>
              </div>
              {lotteryDrawMode === 'scheduled' && (
                <div>
                  <label className="mb-1 block text-sm font-medium">指定開獎時間 *</label>
                  <input
                    type="datetime-local"
                    value={lotteryDrawAt}
                    min={localDateTimeInputValue(new Date())}
                    onChange={(e) => setLotteryDrawAt(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-900">
                <p className="font-bold">抽獎回報系統會自動處理：</p>
                <ul className="mt-2 space-y-1">
                  <li>有效填答者會先收到抽獎資格通知，開獎後會收到「中獎 / 未中獎」系統通知。</li>
                  <li>若問卷提前截止，會依截止時的有效資格名單開獎；手動開獎時由你在收滿後通知。</li>
                  <li>建立者有義務於開獎後七日內送出兌獎方式並交付獎品，平台會保留通知與履約核驗紀錄。</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white p-3 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={lotteryTermsAccepted}
                  onChange={(event) => setLotteryTermsAccepted(event.target.checked)}
                  className="mt-0.5"
                />
                <span>我同意於開獎後七日內交付獎品，接受平台留存通知、介入未收到案件並進行履約核驗。</span>
              </label>
            </div>
          )}
          {rewardMode === 'fixed' && (
          <PricingAdviceCard
            advice={pricingAdvice.data}
            loading={pricingAdvice.isPending}
            currentReward={rewardPoints}
            onApplyPrice={setRewardPoints}
          />
          )}

          {/* QUA-34: Rush delivery tier selector */}
          {rewardMode === 'fixed' && <div>
            <label className="mb-1 block text-sm font-medium">交付速度</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DEADLINE_TIER_OPTIONS.map((opt) => {
                const effectiveReward = Math.round(rewardPoints * opt.multiplier);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeadlineTier(opt.value)}
                    className={`rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors ${
                      deadlineTier === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="mt-0.5 text-slate-600">{opt.hint}</div>
                    {rewardPoints > 0 && opt.multiplier > 1 && (
                      <div className="mt-1 font-medium text-primary">
                        NT${effectiveReward}/份
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              選擇較短的交付期限會自動提高每份獎勵吸引受試者，並設定對應截止日。
            </p>
          </div>}
          </>
        )}

        {type === 'mutual' && (
          <>
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              互惠問卷沒有金錢獎勵與配額限制 — 系統會自動幫你配對另一個有 mutual 問卷的人。
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">外部問卷連結（選填）</label>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                aria-label="外部問卷連結"
                placeholder="https://forms.gle/... （用 Google 表單等外部平台時填）"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                若你的問卷在外部平台（Google Forms 等），填這裡。配對後雙方各自去填、上傳完成截圖，
                互相確認後即可互評信譽（平台無法 AI 審核外部填答）。<br />
                留空則用站內題目（下方編輯），走 AI 品質審核流程。
              </p>
            </div>
          </>
        )}

        {type === 'standard' && (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={aiReviewEnabled}
                onChange={(e) => setAiReviewEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium">導入 AI 品質審核</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  開啟後，受試者填答會經過 AI 三層品質審核（行為訊號 + 邏輯檢核 + AI 語意分析），
                  過濾灌水 / 機器人。建議在題目中段安插 1–2 題「注意力檢核題」加強防呆
                  — 上架後可在問卷詳情頁用「AI 反機器人題建議」自動產生。
                </p>
                {!aiReviewEnabled && (
                  <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    ⚠️ 關閉後將不執行 AI 品質掃描與填答品質審核，填答品質需自行把關。
                  </p>
                )}
              </div>
            </label>
          </div>
        )}
      </section>

      {/* Audience targeting (standard only — mutual 走配對機制) */}
      {type === 'standard' && (
        <AudienceTargeting value={audience} onChange={setAudience} />
      )}

      {/* Questions — 外部問卷不在站內出題，隱藏題目編輯 */}
      {!(type === 'standard' && isExternal) && (
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
            onDuplicate={() => duplicateQuestion(i)}
            jumpTargets={questions
              .map((qq, idx) => ({ question: qq, idx }))
              .filter(({ idx }) => idx !== i)
              .map(({ question: qq, idx }) => ({ index: idx, title: qq.title }))}
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
      )}

      {!(type === 'standard' && isExternal) && (
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">即時預覽</h2>
        <SurveyPreviewPlayer
          title={livePreviewDraft.title}
          description={livePreviewDraft.description}
          coverImageUrl={livePreviewDraft.coverImageUrl}
          questions={livePreviewDraft.questions}
        />
      </section>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        {createSurvey.error && (
          <p className="text-sm text-destructive">儲存失敗，請稍後再試。</p>
        )}
        <button
          type="button"
          aria-label="儲存草稿"
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
