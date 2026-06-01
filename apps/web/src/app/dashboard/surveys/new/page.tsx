'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSurvey, SurveyQuestion, AiDraftResult, SURVEY_CATEGORY_LABELS, DEADLINE_TIER_OPTIONS, type SurveyCategory, type AudienceCriteria, type DeadlineTier } from '@/hooks/use-surveys';
import { usePricingAdvice } from '@/hooks/use-pricing';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { AiDraftPanel } from '@/components/survey-editor/ai-draft-panel';
import { PricingAdviceCard } from '@/components/survey-editor/pricing-advice-card';
import { AudienceTargeting } from '@/components/survey-editor/audience-targeting';
import { SurveyPreviewPlayer } from '@/components/survey-editor/survey-preview-player';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState(0);
  const [deadlineTier, setDeadlineTier] = useState<DeadlineTier>('standard');
  const [targetCount, setTargetCount] = useState(100);
  const [audience, setAudience] = useState<AudienceCriteria>({});
  const [questions, setQuestions] = useState<SurveyQuestion[]>([defaultQuestion()]);
  const livePreviewDraft = useDebouncedValue({ title, description, questions }, 300);

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
        type,
        category: category || undefined,
        aiReviewEnabled: type === 'mutual' ? true : aiReviewEnabled,
        externalUrl: type === 'mutual' && externalUrl.trim() ? externalUrl.trim() : undefined,
        rewardPoints: type === 'mutual' ? 0 : rewardPoints,
        deadlineTier: type === 'mutual' ? 'standard' : deadlineTier,
        targetCount: type === 'mutual' ? 9999 : targetCount,
        // 受眾鎖定只對 standard 有意義（mutual 走配對機制）
        audienceCriteria: type === 'standard' && Object.keys(audience).length > 0 ? audience : undefined,
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

      {/* Type selector */}
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">問卷類型</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setType('standard')}
            className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
              type === 'standard'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">💰</span>
              <span className="font-semibold text-sm">標準（付費取樣）</span>
              {type === 'standard' && (
                <span className="ml-auto text-xs font-medium text-primary">✓</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              設定獎勵點數，平台媒合受試者來填寫。需要預算鎖定 + AI 審核。
            </p>
          </button>

          <button
            type="button"
            onClick={() => setType('mutual')}
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
        </div>
      </section>

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

        <div>
          <label className="mb-1 block text-sm font-medium">分類（選填）</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SurveyCategory | '')}
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
          <PricingAdviceCard
            advice={pricingAdvice.data}
            loading={pricingAdvice.isPending}
            currentReward={rewardPoints}
            onApplyFair={setRewardPoints}
          />

          {/* QUA-34: Rush delivery tier selector */}
          <div>
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
                    <div className="mt-0.5 text-muted-foreground">{opt.hint}</div>
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
          </div>
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
                    ⚠️ 關閉後問卷會直接上架、不過 AI 審核，填答品質需自行把關。
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

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">即時預覽</h2>
        <SurveyPreviewPlayer
          title={livePreviewDraft.title}
          description={livePreviewDraft.description}
          questions={livePreviewDraft.questions}
        />
      </section>

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
