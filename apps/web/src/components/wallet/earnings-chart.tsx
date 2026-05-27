'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import type {
  Formatter,
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';

interface EarningsSummary {
  totalEarned: number;
  pendingRewards: number;
  thisMonth: number;
  bySurvey: { surveyId: string; surveyTitle: string; amount: number }[];
  monthly: { month: string; amount: number }[];
}

const TOP_BAR_COLORS = ['#126b8a', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

const formatCurrency: Formatter<ValueType, NameType> = (value) => {
  const n = typeof value === 'number' ? value : Number(value) || 0;
  return [`NT$${n.toLocaleString('zh-TW')}`, '收益'];
};

const formatMonthLabel = (_: unknown, payload: ReadonlyArray<{ payload?: { fullMonth?: string } }>) =>
  payload?.[0]?.payload?.fullMonth ?? '';

const formatTitleLabel = (_: unknown, payload: ReadonlyArray<{ payload?: { fullTitle?: string } }>) =>
  payload?.[0]?.payload?.fullTitle ?? '';

/**
 * Phase GG: 受試者 wallet 月度收益視覺化
 *  - 上方：monthly trend area chart（最近 6 個月）
 *  - 下方：bySurvey top-5 條形圖
 *
 * Phase HH (Codex review):
 *  - Formatter 型別取代 any
 *  - surveyTitle 防呆 + Cell key 不會 collide
 *  - sr-only a11y 摘要供 screen reader 讀取
 *  - 單月資料時改顯示 hint，避免空 area chart 顯得稀疏
 */
export function EarningsChart({ summary }: { summary: EarningsSummary }) {
  const monthly = useMemo(
    () =>
      summary.monthly.slice(-6).map((m) => ({
        month: m.month.slice(5), // "2026-05" → "05"
        fullMonth: m.month,
        amount: m.amount,
      })),
    [summary.monthly],
  );

  const topSurveys = useMemo(
    () =>
      [...summary.bySurvey]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((s, i) => {
          const title = s.surveyTitle?.trim() || '未命名問卷';
          return {
            surveyId: s.surveyId,
            label: title.length > 14 ? `${title.slice(0, 14)}…` : title,
            fullTitle: title,
            amount: s.amount,
            color: TOP_BAR_COLORS[i % TOP_BAR_COLORS.length],
          };
        }),
    [summary.bySurvey],
  );

  const hasMonthly = monthly.length > 0;
  const hasSurveys = topSurveys.length > 0;
  const isSingleMonth = monthly.length === 1;

  if (!hasMonthly && !hasSurveys) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        尚無歷史獎勵紀錄，完成問卷後這裡會出現你的收益趨勢。
      </div>
    );
  }

  // sr-only：給螢幕閱讀器的純文字摘要（chart 本身是 SVG，screen reader 友善度低）
  const monthlySummary = monthly.map((m) => `${m.fullMonth} NT$${m.amount.toLocaleString('zh-TW')}`).join('；');
  const surveysSummary = topSurveys
    .map((s, i) => `第 ${i + 1} 名 ${s.fullTitle} NT$${s.amount.toLocaleString('zh-TW')}`)
    .join('；');

  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border border-border bg-card p-5"
        aria-labelledby="earnings-trend-title"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3
              id="earnings-trend-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              月度收益趨勢
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">最近 {monthly.length} 個月</p>
          </div>
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            NT${summary.totalEarned.toLocaleString('zh-TW')}
            <span className="ml-1 text-[10px] font-normal text-slate-500">累計</span>
          </p>
        </div>

        <p className="sr-only">最近 {monthly.length} 個月收益趨勢：{monthlySummary}。累計 NT${summary.totalEarned.toLocaleString('zh-TW')}。</p>

        {isSingleMonth ? (
          <div className="flex h-32 items-center justify-center rounded-lg bg-slate-50 px-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                NT${monthly[0]!.amount.toLocaleString('zh-TW')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {monthly[0]!.fullMonth} · 目前僅 1 個月資料，待累積更多月份顯示趨勢
              </p>
            </div>
          </div>
        ) : (
          <div className="h-32 -mx-1" role="img" aria-label={`月度收益面積圖：${monthlySummary}`}>
            <ResponsiveContainer width="100%" height={128}>
              <AreaChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#126b8a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#126b8a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                  formatter={formatCurrency}
                  labelFormatter={formatMonthLabel}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#126b8a"
                  strokeWidth={2}
                  fill="url(#earningsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {hasSurveys && (
        <section
          className="rounded-xl border border-border bg-card p-5"
          aria-labelledby="top-surveys-title"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h3
              id="top-surveys-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              貢獻最高的問卷
            </h3>
            <p className="text-xs text-slate-500">Top {topSurveys.length}</p>
          </div>

          <p className="sr-only">貢獻最高的 {topSurveys.length} 份問卷：{surveysSummary}。</p>

          <div
            className="h-36 -mx-1"
            role="img"
            aria-label={`貢獻最高問卷條形圖：${surveysSummary}`}
          >
            <ResponsiveContainer width="100%" height={144}>
              <BarChart
                data={topSurveys}
                layout="vertical"
                margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="label"
                  type="category"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={94}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                  formatter={formatCurrency}
                  labelFormatter={formatTitleLabel}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {topSurveys.map((s, i) => (
                    <Cell key={`${s.surveyId}-${i}`} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
