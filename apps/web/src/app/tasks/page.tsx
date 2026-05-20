'use client';

import Link from 'next/link';
import { useAvailableSurveys, useMyResponses, useRespondentAssistant } from '@/hooks/use-responses';
import { useState } from 'react';

const TAB = { available: '可填問卷', history: '填答紀錄' } as const;
type TabKey = keyof typeof TAB;

const STATUS_LABELS: Record<string, string> = {
  submitted: '已提交',
  rewarded: '已領獎',
  in_progress: '填答中',
  rejected: '未通過',
};

export default function TasksPage() {
  const [tab, setTab] = useState<TabKey>('available');
  const { data: surveys = [], isLoading: surveysLoading, isError: surveysError } = useAvailableSurveys();
  const { data: history = [], isLoading: historyLoading, isError: historyError } = useMyResponses();

  // KPI 計算
  const availableCount = surveys.length;
  const potentialReward = surveys.reduce((sum, s) => sum + (s.rewardPoints ?? 0), 0);
  const earnedReward = history
    .filter((r) => r.status === 'rewarded')
    .reduce((sum, r) => sum + (r.rewardPoints ?? 0), 0);
  const completedCount = history.filter((r) => r.status === 'rewarded' || r.status === 'submitted').length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">填問卷賺獎勵</h1>
        <p className="text-sm text-muted-foreground mt-1">挑選符合你條件的問卷，認真填答賺取現金獎勵</p>
      </div>

      {/* AI 助手 */}
      <AssistantPanel />

      {/* KPI cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="可接案"
          value={availableCount}
          suffix="份"
          extra={availableCount > 0 ? `總獎勵 NT$${potentialReward}` : '完善資料以接收更多'}
          accent="blue"
        />
        <Kpi label="已完成" value={completedCount} suffix="份" accent="green" />
        <Kpi label="累計收益" value={earnedReward} prefix="NT$" />
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
          </button>
        ))}
      </div>

      {/* Available surveys */}
      {tab === 'available' && (
        <div className="space-y-3">
          {surveysLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

          {surveysError && (
            <p className="text-sm text-destructive">載入失敗，請重新整理頁面。</p>
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

          {surveys.map((s) => (
            <Link
              key={s.id}
              href={`/tasks/${s.id}`}
              className="block rounded-xl border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-[#126b8a]/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{s.title}</p>
                  {s.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
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
                    {s.expiresAt && (
                      <span>截止 {new Date(s.expiresAt).toLocaleDateString('zh-TW')}</span>
                    )}
                    {s.isAnonymous && (
                      <span className="rounded bg-muted px-1.5 py-0.5">匿名</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-2xl font-extrabold text-[#126b8a]">NT${s.rewardPoints}</span>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">獎勵</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-3">
          {historyLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

          {historyError && (
            <p className="text-sm text-destructive">載入失敗，請重新整理頁面。</p>
          )}

          {!historyLoading && !historyError && history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">尚無填答紀錄</p>
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
                <p className="text-sm font-bold mt-1.5 text-[#126b8a]">+NT${r.rewardPoints}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
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
