'use client';

import Link from 'next/link';
import { useAvailableSurveys, useConfirmLotteryReceipt, useLotteryResults, useMyResponses, useReportLotteryIssue, useRespondentAssistant, useTaskCategoryCounts, type LotteryResult, type LotteryWinning } from '@/hooks/use-responses';
import { SURVEY_CATEGORY_LABELS, type SurveyCategory } from '@/hooks/use-surveys';
import { useState, useEffect } from 'react';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { useMyProfile, type RespondentProfile } from '@/hooks/use-profile';
import { profileCompleteness } from '@/lib/profile-completeness';
import { estimateFillMinutes } from '@/lib/fill-time';
import { toCsv } from '@/lib/to-csv';
import { lotteryWinnerActions } from '@/lib/lottery-result-actions';

const TAB = { available: '可填問卷', history: '填答紀錄', lottery: '抽獎回饋' } as const;
type TabKey = keyof typeof TAB;

function rewardLabel(survey: { rewardMode?: 'fixed' | 'lottery'; rewardPoints: number; lotteryPrize?: string | null }) {
  return survey.rewardMode === 'lottery' ? `抽 ${survey.lotteryPrize ?? '獎品'}` : `NT$${survey.rewardPoints}`;
}

const STATUS_LABELS: Record<string, string> = {
  submitted: '已提交',
  rewarded: '已領獎',
  in_progress: '填答中',
  rejected: '未通過',
};

function isRespondentProfile(profile: unknown): profile is RespondentProfile {
  return !!profile && typeof profile === 'object' && 'ageRange' in profile;
}

export default function TasksPage() {
  const [tab, setTab] = useState<TabKey>('available');
  const [category, setCategory] = useState<SurveyCategory | ''>('');
  const [sortBy, setSortBy] = useState<'recommended' | 'reward' | 'newest'>('recommended');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const { data: myProfile } = useMyProfile();
  const respondentProfile = isRespondentProfile(myProfile) ? myProfile : null;
  const { data: surveys = [], isLoading: surveysLoading, isError: surveysError, refetch: refetchSurveys } = useAvailableSurveys(category || undefined);
  const { data: catCounts = {} } = useTaskCategoryCounts();
  const { data: history = [], isLoading: historyLoading, isError: historyError } = useMyResponses();
  const { data: lotteryResults = [], isLoading: lotteryResultsLoading } = useLotteryResults();

  // 還原/保存任務排序偏好（client-only，避免 hydration 不一致）
  useEffect(() => {
    try {
      const raw = localStorage.getItem('qw_task_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.sortBy === 'reward' || p.sortBy === 'newest' || p.sortBy === 'recommended') setSortBy(p.sortBy);
        if (typeof p.urgentOnly === 'boolean') setUrgentOnly(p.urgentOnly);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('qw_task_prefs', JSON.stringify({ sortBy, urgentOnly }));
    } catch {
      /* ignore */
    }
  }, [sortBy, urgentOnly]);

  // KPI 計算
  const availableCount = surveys.length;
  const availableLotteryCount = surveys.filter((s) => s.rewardMode === 'lottery').length;
  const fixedRewardSurveys = surveys.filter((s) => s.rewardMode !== 'lottery');
  const potentialReward = fixedRewardSurveys.reduce((sum, s) => sum + (s.rewardPoints ?? 0), 0);
  const earnedReward = history
    .filter((r) => r.status === 'rewarded')
    .reduce((sum, r) => sum + (r.rewardPoints ?? 0), 0);
  const completedCount = history.filter((r) => r.status === 'rewarded' || r.status === 'submitted').length;

  // 篩選 + 排序（不可變副本；recommended = 後端原序）
  const kw = query.trim().toLowerCase();
  const displayedSurveys = surveys
    .filter((s) => !urgentOnly || (s.deadlineTier && s.deadlineTier !== 'standard'))
    .filter((s) => !kw || s.title.toLowerCase().includes(kw))
    .sort((a, b) => {
    if (sortBy === 'reward') return (b.rewardPoints ?? 0) - (a.rewardPoints ?? 0);
    if (sortBy === 'newest') return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
    return 0;
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">填問卷賺獎勵</h1>
        <p className="text-sm text-muted-foreground mt-1">挑選符合你條件的問卷，認真填答取得現金或抽獎回饋</p>
      </div>

      {/* AI 助手 */}
      <AssistantPanel />

      {/* KPI cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="可接案"
          value={availableCount}
          suffix="份"
          extra={availableCount > 0 ? `固定現金 NT$${potentialReward}` : '完善資料以接收更多'}
          accent="blue"
        />
        <Kpi label="已完成" value={completedCount} suffix="份" accent="green" />
        <Kpi
          label="累計收益"
          value={earnedReward}
          prefix="NT$"
          extra={availableLotteryCount > 0 ? `${availableLotteryCount} 份可參與抽獎` : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(Object.entries(TAB) as [TabKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2',
              tab === key
                ? 'border-[#126b8a] text-[#126b8a]'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
            {key === 'available' && availableCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#126b8a]/10 px-1.5 text-[10px] font-semibold text-[#126b8a]">
                {availableCount}
              </span>
            )}
            {key === 'lottery' && lotteryResults.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                {lotteryResults.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 個資完整度提示（available tab、未完善、未關閉時） */}
      {tab === 'available' && respondentProfile && !nudgeDismissed && profileCompleteness(respondentProfile).percent < 100 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#126b8a]/30 bg-[#126b8a]/5 px-4 py-2.5">
          <p className="text-xs text-[#126b8a]">
            完善個人資料（目前 {profileCompleteness(respondentProfile).percent}%）可被媒合到更多問卷。
            <Link href="/profile/edit" className="ml-1 font-semibold underline">去完善 →</Link>
          </p>
          <button
            onClick={() => setNudgeDismissed(true)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            aria-label="關閉提示"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search (only on available tab) */}
      {tab === 'available' && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋問卷標題…"
          aria-label="搜尋問卷標題"
          className="mb-3 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      )}

      {/* Category filter (only on available tab) */}
      {tab === 'available' && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground">分類:</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SurveyCategory | '')}
            aria-label="篩選問卷分類"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">全部 ({Object.values(catCounts).reduce((a, b) => a + b, 0)})</option>
            {(Object.keys(SURVEY_CATEGORY_LABELS) as SurveyCategory[]).map((k) => {
              const n = catCounts[k] ?? 0;
              return (
                <option key={k} value={k}>
                  {SURVEY_CATEGORY_LABELS[k]} ({n})
                </option>
              );
            })}
            {(catCounts.uncategorized ?? 0) > 0 && (
              <option value="" disabled>未分類 ({catCounts.uncategorized})</option>
            )}
          </select>
          {category && (
            <button
              onClick={() => setCategory('')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              清除
            </button>
          )}
          <span className="ml-auto" />
          <label className="text-xs font-semibold text-muted-foreground">排序:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="排序方式"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="recommended">推薦</option>
            <option value="reward">獎勵高 → 低</option>
            <option value="newest">最新</option>
          </select>
          <button
            type="button"
            onClick={() => setUrgentOnly((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
              urgentOnly
                ? 'border-orange-300 bg-orange-100 text-orange-700'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            ⚡ 只看加急
          </button>
          {(category || urgentOnly || query || sortBy !== 'recommended') && (
            <button
              type="button"
              onClick={() => {
                setCategory('');
                setUrgentOnly(false);
                setQuery('');
                setSortBy('recommended');
              }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              清除篩選
            </button>
          )}
        </div>
      )}

      {/* Available surveys */}
      {tab === 'available' && (
        <div className="space-y-3">
          {surveysLoading && (
            <div className="space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-border bg-background p-4">
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
                  <div className="mt-2 h-3 w-28 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {surveysError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
              <p className="text-sm text-destructive">載入失敗。</p>
              <button
                onClick={() => refetchSurveys()}
                className="mt-2 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                重試
              </button>
            </div>
          )}

          {!surveysLoading && !surveysError && surveys.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#126b8a]/10">
                <svg className="h-6 w-6 text-[#126b8a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-muted-foreground">目前沒有符合條件的問卷</p>
              <p className="text-xs text-muted-foreground mt-1">完善個人資料可接收到更多問卷推薦</p>
              <Link href="/profile/edit" className="mt-4 inline-block text-sm font-semibold text-[#126b8a] hover:underline">
                編輯個人資料 →
              </Link>
            </div>
          )}

          {!surveysLoading && !surveysError && surveys.length > 0 && displayedSurveys.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              沒有符合目前篩選 / 搜尋的問卷。
            </p>
          )}

          {displayedSurveys.map((s) => (
            <Link
              key={s.id}
              href={`/tasks/${s.id}`}
              className="block rounded-xl border border-border bg-background overflow-hidden transition-all hover:-translate-y-0.5 hover:border-[#126b8a]/40 hover:shadow-md"
            >
              {/* QUA-279: Cover image as card background */}
              {s.coverImageUrl ? (
                <div className="relative h-36 bg-cover bg-center" style={{ backgroundImage: `url(${resolveAssetUrl(s.coverImageUrl)})` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <div className="flex items-center gap-2">
                      {s.category && (
                        <span className="rounded-full bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 text-[10px] font-medium">
                          {SURVEY_CATEGORY_LABELS[s.category as SurveyCategory] ?? s.category}
                        </span>
                      )}
                      <p className="font-semibold text-white text-sm truncate">{s.title}</p>
                    </div>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className="text-sm font-extrabold text-white drop-shadow-lg">{rewardLabel(s)}</span>
                  </div>
                </div>
              ) : null}
              <div className="p-4">
                {!s.coverImageUrl && (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {s.category && (
                          <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-medium">
                            {SURVEY_CATEGORY_LABELS[s.category as SurveyCategory] ?? s.category}
                          </span>
                        )}
                        <p className="font-semibold truncate">{s.title}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-base font-extrabold text-[#126b8a]">{rewardLabel(s)}</span>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">獎勵</p>
                    </div>
                  </div>
                )}
                {s.description && (
                  <p className={`text-sm text-muted-foreground mt-1 line-clamp-2 ${s.coverImageUrl ? 'pl-0' : ''}`}>
                    {s.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {s.completedCount}/{s.targetCount} 份
                  </span>
                  {!!s.questionCount && s.questionCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      約 {estimateFillMinutes(s.questionCount ?? 0)} 分鐘
                    </span>
                  )}
                  {s.expiresAt && (
                    <span>截止 {new Date(s.expiresAt).toLocaleDateString('zh-TW')}</span>
                  )}
                  {s.isAnonymous && (
                    <span className="rounded bg-muted px-1.5 py-0.5">匿名</span>
                  )}
                  {s.deadlineTier && s.deadlineTier !== 'standard' && (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-700">⚡ 加急</span>
                  )}
                  {s.publishedAt && Date.now() - new Date(s.publishedAt).getTime() < 86400000 && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">新</span>
                  )}
                  {s.targetCount > 0 && s.completedCount / s.targetCount >= 0.8 && (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 font-medium text-rose-700">即將額滿</span>
                  )}
                </div>
                {s.rewardMode === 'lottery' && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    <p className="font-bold">抽獎回饋：{s.lotteryPrize ?? '獎品'}</p>
                    <p className="mt-0.5 font-semibold">
                      {lotteryDisclosure(s)}。有效填答者會收到資格與開獎結果通知，平台追蹤建立者履約。
                    </p>
                  </div>
                )}
                {s.coverImageUrl && (
                  <div className="flex justify-end mt-2">
                    <span className="text-base font-extrabold text-[#126b8a]">{rewardLabel(s)}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-3">
          {historyLoading && (
            <div className="space-y-3" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-border bg-background p-4">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="mt-2 h-3 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {historyError && (
            <p className="text-sm text-destructive">載入失敗，請重新整理頁面。</p>
          )}

          {!historyLoading && !historyError && history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">尚無填答紀錄</p>
          )}

          {history.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  const rows: string[][] = [['問卷', '狀態', '提交時間', '獎勵', '品質分']];
                  for (const r of history) {
                    rows.push([
                      r.surveyTitle,
                      STATUS_LABELS[r.status] ?? r.status,
                      r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-TW') : '',
                      rewardLabel(r),
                      r.qualityScore != null ? String(r.qualityScore) : '',
                    ]);
                  }
                  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `填答紀錄_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                匯出 CSV
              </button>
            </div>
          )}

          {history.map((r) => (
            <div key={r.responseId} className="rounded-xl border border-border bg-background p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.surveyTitle}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {r.submittedAt
                    ? new Date(r.submittedAt).toLocaleString('zh-TW')
                    : ''}
                </p>
                {typeof r.qualityScore === 'number' && (
                  <span
                    className={[
                      'mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
                      r.qualityBreakdown?.status === 'rejected'
                        ? 'bg-red-50 text-red-600'
                        : r.qualityBreakdown?.status === 'suspicious'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700',
                    ].join(' ')}
                    title="AI 品質審核分數"
                  >
                    品質分 {r.qualityScore}
                  </span>
                )}
                {(r.qualityBreakdown?.status === 'rejected' || r.qualityBreakdown?.status === 'suspicious') &&
                  !!r.qualityBreakdown?.flags?.length && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      可改進：{r.qualityBreakdown.flags.slice(0, 3).join('、')}
                    </p>
                  )}
                {r.rewardMode === 'lottery' && (
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    {r.lotteryDrawnAt
                      ? '已開獎，請至「抽獎回饋」查看結果'
                      : `已取得抽獎資格，等待開獎通知 · ${lotteryDisclosure(r)}`}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 ml-3">
                <span className={[
                  'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                  r.status === 'rewarded' ? 'bg-green-100 text-green-700' :
                  r.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                  r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-muted text-muted-foreground',
                ].join(' ')}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                <p className="text-sm font-bold mt-1.5 text-[#126b8a]">{rewardLabel(r)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lottery' && (
        <div className="space-y-3">
          {lotteryResultsLoading && (
            <div className="space-y-3" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-border bg-background p-4">
                  <div className="h-4 w-2/5 rounded bg-muted" />
                  <div className="mt-2 h-3 w-32 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
          {!lotteryResultsLoading && lotteryResults.length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">尚無抽獎結果紀錄</p>
          )}
          {lotteryResults.map((result) => <LotteryResultCard key={result.id} result={result} />)}
        </div>
      )}
    </main>
  );
}

function LotteryResultCard({ result }: { result: LotteryResult }) {
  if (result.isWinner) return <LotteryWinningCard winning={result} />;
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="font-semibold text-slate-900">{result.surveyTitle}</h2>
      <p className="mt-1 text-sm text-slate-600">本次未抽中「{result.prize}」，感謝你的參與。</p>
      {result.drawnAt && <p className="mt-2 text-xs text-slate-500">開獎時間：{new Date(result.drawnAt).toLocaleString('zh-TW')}</p>}
      <LotteryAuditBadge result={result} />
    </section>
  );
}

function LotteryWinningCard({ winning }: { winning: LotteryResult }) {
  const [issueNote, setIssueNote] = useState('');
  const confirm = useConfirmLotteryReceipt();
  const report = useReportLotteryIssue();
  const { canConfirm, canReport, fulfillmentOverdue } = lotteryWinnerActions(winning);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="font-semibold text-slate-900">{winning.surveyTitle}</h2>
      <p className="mt-1 text-sm font-bold text-amber-800">中獎獎品：{winning.prize}</p>
      {winning.fulfillmentNote ? (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-700">兌獎說明：{winning.fulfillmentNote}</p>
      ) : (
        <p className="mt-3 text-xs text-slate-600">等待問卷建立者送出兌獎方式。平台會追蹤履約狀態。</p>
      )}
      {winning.fulfillmentDueAt && !winning.platformVerifiedAt && (
        <p className={`mt-3 text-xs font-semibold ${fulfillmentOverdue ? 'text-red-700' : 'text-slate-600'}`}>
          建立者履約期限：{new Date(winning.fulfillmentDueAt).toLocaleString('zh-TW')}
          {fulfillmentOverdue ? '，目前已逾期，可向平台回報。' : '。'}
        </p>
      )}
      {(canConfirm || canReport) && (
        <div className="mt-3 space-y-2">
          {canConfirm && (
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate(winning.id)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              我已收到獎品
            </button>
          )}
          {canReport && (
            <>
              <textarea
                value={issueNote}
                onChange={(event) => setIssueNote(event.target.value)}
                placeholder="若尚未收到獎品，請說明問題，平台會介入協助。"
                className="min-h-20 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={issueNote.trim().length < 5 || report.isPending}
                onClick={() => report.mutate({ id: winning.id, note: issueNote })}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                {winning.fulfillmentStatus === 'pending' ? '回報建立者逾期未通知' : '回報尚未收到'}
              </button>
            </>
          )}
        </div>
      )}
      {winning.recipientStatus === 'received' && <p className="mt-3 text-xs font-semibold text-emerald-700">已確認收到獎品，等待平台完成核驗。</p>}
      {winning.recipientStatus === 'issue_reported' && <p className="mt-3 text-xs font-semibold text-red-700">已回報平台介入處理：{winning.recipientIssueNote}</p>}
      {winning.platformInterventionNote && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
          <p className="font-semibold">平台客服處理歷程</p>
          <div className="mt-2 space-y-2">
            {(winning.platformInterventionHistory?.length
              ? winning.platformInterventionHistory
              : [{ intervenedAt: winning.platformIntervenedAt, note: winning.platformInterventionNote, reason: 'winner_issue' as const }]
            ).map((entry, index) => (
              <p key={`${entry.intervenedAt}-${index}`} className="whitespace-pre-wrap rounded-md bg-white/70 p-2 font-semibold">
                {entry.note}
                {entry.intervenedAt && <span className="mt-1 block font-normal text-sky-700">{new Date(entry.intervenedAt).toLocaleString('zh-TW')}</span>}
              </p>
            ))}
          </div>
        </div>
      )}
      {winning.platformVerifiedAt && <p className="mt-2 text-xs font-semibold text-emerald-800">平台已核驗完成。</p>}
      <LotteryAuditBadge result={winning} />
    </section>
  );
}

function LotteryAuditBadge({ result }: { result: LotteryResult }) {
  if (result.drawAuditVerified === null) return null;
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${result.drawAuditVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
      平台抽獎公平性核對：{result.drawAuditVerified ? '通過' : '異常，請聯絡客服'} · {result.participantCount} 位有效參與者
    </p>
  );
}

// ─── AI Assistant Panel ──────────────────────────────────────────────────────

function AssistantPanel() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useRespondentAssistant(enabled);

  return (
    <section className="mb-6 relative overflow-hidden rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.04] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#126b8a] to-[#8B5CF6] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">AI 推薦</h2>
            <p className="text-[11px] text-slate-500">為你挑出最適合的問卷</p>
          </div>
        </div>
        <button
          onClick={() => (enabled ? refetch() : setEnabled(true))}
          disabled={isLoading || isFetching}
          className="rounded-md bg-[#126b8a] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isLoading || isFetching ? '分析中…' : enabled ? '重新生成' : '取得推薦'}
        </button>
      </div>

      {!enabled && !data && (
        <p className="relative text-sm text-slate-600">
          點擊「取得推薦」由 AI 根據你的興趣與紀錄挑出最適合你的問卷
        </p>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
        </div>
      )}

      {error && (
        <p className="relative text-sm text-red-600">AI 服務暫時無法使用</p>
      )}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-4">
          {data.topPick && (
            <div className="rounded-lg bg-white p-4 shadow-sm border border-[#126b8a]/15">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#126b8a] mb-1">
                    🎯 最適合你的問卷
                  </p>
                  <p className="text-base font-bold text-slate-900">{data.topPick.title}</p>
                  <p className="text-sm text-slate-700 mt-1 leading-relaxed">{data.topPick.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-2xl font-extrabold text-[#126b8a]">NT${data.topPick.reward}</span>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">獎勵</p>
                </div>
              </div>
              <Link
                href={`/tasks/${data.topPick.surveyId}`}
                className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#126b8a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f5d78]"
              >
                立即填寫 →
              </Link>
            </div>
          )}

          {!data.topPick && (
            <div className="rounded-lg bg-white p-4 border border-dashed border-slate-300 text-center">
              <p className="text-sm text-slate-600">目前沒有符合你的新問卷</p>
              <Link href="/profile/edit" className="mt-2 inline-block text-xs font-semibold text-[#126b8a] hover:underline">
                完善個人資料以接收更多推薦 →
              </Link>
            </div>
          )}

          {/* Earnings snapshot */}
          <div className="grid grid-cols-3 gap-2">
            <EarnStat label="已完成" value={data.earnings.completed} suffix="份" />
            <EarnStat label="累計收益" value={data.earnings.totalEarned} prefix="NT$" />
            <EarnStat label="本週潛能" value={data.earnings.weeklyPotential} prefix="NT$" hint="(若每天 1 份)" />
          </div>

          {/* Tips */}
          {data.tips.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                💡 賺更多的技巧
              </p>
              <ul className="space-y-1">
                {data.tips.map((t, i) => (
                  <li key={i} className="border-l-2 border-amber-400 bg-amber-50/50 pl-2 py-1 text-xs text-slate-700 rounded-r">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-slate-400 text-right">
            生成於 {new Date(data.generatedAt).toLocaleString('zh-TW')}
          </p>
        </div>
      )}
    </section>
  );
}

function EarnStat({ label, value, prefix, suffix, hint }: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-white/80 p-2.5 border border-[#126b8a]/10">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-800">
        {prefix && <span className="text-xs font-normal text-slate-400 mr-0.5">{prefix}</span>}
        {value}
        {suffix && <span className="ml-0.5 text-xs font-normal text-slate-400">{suffix}</span>}
      </p>
      {hint && <p className="text-[9px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Kpi({
  label, value, prefix, suffix, extra, accent = 'default',
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  extra?: string;
  accent?: 'default' | 'blue' | 'green';
}) {
  const accentClass = {
    default: 'text-foreground',
    blue: 'text-[#126b8a]',
    green: 'text-green-600',
  }[accent];
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accentClass}`}>
        {prefix && <span className="text-sm font-normal text-muted-foreground mr-0.5">{prefix}</span>}
        {value}
        {suffix && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
      {extra && <p className="mt-0.5 text-xs text-muted-foreground">{extra}</p>}
    </div>
  );
}
