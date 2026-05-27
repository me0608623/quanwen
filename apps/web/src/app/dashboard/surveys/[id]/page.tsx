'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useSurvey,
  useUpdateSurvey,
  usePublishSurvey,
  useDeleteSurvey,
  useBudgetCheck,
  SurveyQuestion,
} from '@/hooks/use-surveys';
import { QuestionEditor } from '@/components/survey-editor/question-editor';
import { AiDraftPanel } from '@/components/survey-editor/ai-draft-panel';
import { AiImprovePanel } from '@/components/survey-editor/ai-improve-panel';
import { AntiCheatPanel } from '@/components/survey-editor/anti-cheat-panel';
import { SurveyPreviewModal } from '@/components/survey-editor/survey-preview-modal';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '審核中',
  published: '上架中',
  paused: '已暫停',
  closed: '已截止',
  rejected: '已退回',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-muted-foreground',
  pending_review: 'text-yellow-600',
  published: 'text-green-600',
  paused: 'text-orange-500',
  closed: 'text-muted-foreground',
  rejected: 'text-destructive',
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
  const [minReputation, setMinReputation] = useState(0); // Phase 7.5
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // Phase G.3

  useEffect(() => {
    if (survey) {
      setTitle(survey.title);
      setDescription(survey.description ?? '');
      setQuestions(survey.questions);
      setMinReputation(Number(survey.audienceCriteria?.minReputationScore ?? 0));
    }
  }, [survey]);

  const markDirty = () => setDirty(true);

  const showAxiosError = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { message?: string }; status?: number } };
    const msg = e?.response?.data?.message ?? fallback;
    alert(msg);
  };

  const handleSave = async () => {
    const audienceCriteria = {
      ...(survey?.audienceCriteria ?? {}),
      minReputationScore: minReputation > 0 ? minReputation : undefined,
    };
    try {
      await updateSurvey.mutateAsync({ title, description, questions, audienceCriteria });
      setDirty(false);
    } catch (err) {
      showAxiosError(err, '儲存失敗，請稍後再試');
    }
  };

  const handlePublish = async () => {
    if (budgetCheck && !budgetCheck.sufficient && budgetCheck.requiredAmount > 0) {
      const msg = `錢包餘額不足！\n` +
        `需要：NT$${budgetCheck.requiredAmount.toLocaleString()}\n` +
        `目前餘額：NT$${budgetCheck.walletBalance.toLocaleString()}\n\n` +
        `仍要繼續送出審核嗎？（審核通過後需補足餘額才能正常發獎勵）`;
      if (!confirm(msg)) return;
    } else {
      if (!confirm('確定要送出審核嗎？送出後需等 AI 審核通過才會上架。')) return;
    }
    try {
      await publishSurvey.mutateAsync(id);
    } catch (err) {
      showAxiosError(err, '送出審核失敗');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此草稿？')) return;
    try {
      await deleteSurvey.mutateAsync(id);
      router.push('/dashboard');
    } catch (err) {
      showAxiosError(err, '刪除失敗');
    }
  };

  const updateQuestion = (i: number, q: SurveyQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? { ...q, sortOrder: i } : old)));
    markDirty();
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, sortOrder: idx })));
    markDirty();
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { type: 'single_choice', title: '', sortOrder: prev.length, isRequired: true, options: [{ label: '', sortOrder: 0 }, { label: '', sortOrder: 1 }] },
    ]);
    markDirty();
  };

  if (isLoading) return <div className="p-10 text-muted-foreground text-sm">載入中…</div>;
  if (!survey) return <div className="p-10 text-destructive text-sm">問卷不存在</div>;

  const canEdit = survey.status === 'draft' || survey.status === 'rejected';

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← 返回後台
          </button>
          <h1 className="mt-1 text-2xl font-bold">{survey.title}</h1>
          <span className={`text-sm font-medium ${STATUS_COLORS[survey.status] ?? ''}`}>
            {STATUS_LABELS[survey.status] ?? survey.status}
          </span>
          {survey.aiRejectReason && (
            <p className="mt-1 text-xs text-destructive">退回原因：{survey.aiRejectReason}</p>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2">
            {questions.length > 0 && (
              <button
                onClick={() => setShowPreview(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                👁️ 預覽
              </button>
            )}
            {dirty && (
              <button
                onClick={handleSave}
                disabled={updateSurvey.isPending}
                className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {updateSurvey.isPending ? '儲存…' : '儲存草稿'}
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={publishSurvey.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              送出審核
            </button>
            <button
              onClick={handleDelete}
              className="text-sm text-destructive hover:underline"
            >
              刪除
            </button>
          </div>
        )}

        {/* Phase G.3: 預覽 modal */}
        <SurveyPreviewModal
          title={title}
          description={description}
          questions={questions}
          open={showPreview}
          onClose={() => setShowPreview(false)}
        />
      </div>

      {/* 預算不足警告 */}
      {canEdit && budgetCheck && !budgetCheck.sufficient && budgetCheck.requiredAmount > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <strong>錢包餘額不足：</strong>此問卷預計需要 NT${budgetCheck.requiredAmount.toLocaleString()} 作為獎勵預算，
          但您目前錢包餘額為 NT${budgetCheck.walletBalance.toLocaleString()}。
          {' '}
          <Link href="/wallet" className="underline font-medium">前往儲值 →</Link>
        </div>
      )}

      {/* AI Draft（草稿才顯示） */}
      {canEdit && (
        <AiDraftPanel
          onApply={(draft) => {
            setTitle(draft.title);
            setDescription(draft.description ?? '');
            setQuestions(draft.questions.map((q, i) => ({ ...q, sortOrder: i })));
            markDirty();
          }}
        />
      )}

      {/* AI 優化建議（有題目時顯示） */}
      {survey.questions.length > 0 && <AiImprovePanel surveyId={survey.id} />}

      {/* Phase 4：AI 反作弊設計（草稿可編 + 至少 1 題時顯示） */}
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

      {/* Basic info */}
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">基本資訊</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); markDirty(); }}
          disabled={!canEdit}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          disabled={!canEdit}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      </section>

      {/* Phase 7.5: 受眾過濾 — 最低信譽分 */}
      <section className="space-y-3 rounded-lg border border-amber-300/40 bg-amber-50/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700">🛡️ 受眾過濾</h2>
            <p className="text-[11px] text-slate-600">設定最低信譽分可篩掉常被退件的受試者</p>
          </div>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
            {minReputation === 0 ? '不限制' : `≥ ${minReputation} 分`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 w-8">0</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minReputation}
            onChange={(e) => { setMinReputation(Number(e.target.value)); markDirty(); }}
            disabled={!canEdit}
            className="flex-1 accent-amber-600"
          />
          <span className="text-[10px] text-slate-500 w-8 text-right">100</span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500">
          <p>0：所有人</p>
          <p>≥50：基本門檻</p>
          <p>≥70：良好受試者</p>
          <p>≥90：優質受試者</p>
        </div>
      </section>

      {/* Questions */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          題目（{questions.length} 題）
        </h2>

        {questions.map((q, i) => (
          canEdit ? (
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
          ) : (
            <div key={i} className="rounded-lg border border-border p-4 text-sm">
              <span className="text-xs text-muted-foreground">Q{i + 1} · {q.type}</span>
              <p className="mt-1 font-medium">{q.title}</p>
              {q.options?.map((o, j) => (
                <p key={j} className="ml-4 mt-0.5 text-muted-foreground">· {o.label}</p>
              ))}
            </div>
          )
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            + 新增題目
          </button>
        )}
      </section>

      {/* Stats（非草稿）— mutual 與 standard 分流 */}
      {survey.status !== 'draft' && survey.type === 'mutual' && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤝</span>
            <h2 className="font-semibold">互惠模式</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            這份問卷不付費取樣，靠系統自動配對另一份互惠問卷的發起人。
          </p>
          <p className="text-sm">
            想看當前配對狀態？到{' '}
            <Link href="/mutual" className="font-medium text-primary hover:underline">
              我的互惠
            </Link>{' '}
            查看完整列表（配對中 / 輪到我填 / 已解鎖）。
          </p>
        </section>
      )}

      {survey.status !== 'draft' && survey.type !== 'mutual' && (
        <section className="rounded-lg border border-border p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{survey.completedCount}</p>
              <p className="text-xs text-muted-foreground">已收份數</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{survey.targetCount}</p>
              <p className="text-xs text-muted-foreground">目標份數</p>
            </div>
            {survey.aiScore != null && (
              <div>
                <p className="text-2xl font-bold">{survey.aiScore}</p>
                <p className="text-xs text-muted-foreground">AI 品質分</p>
              </div>
            )}
          </div>
          {survey.completedCount > 0 && (
            <div className="text-center">
              <Link
                href={`/dashboard/surveys/${survey.id}/stats`}
                className="text-sm text-primary hover:underline"
              >
                查看詳細統計 →
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
