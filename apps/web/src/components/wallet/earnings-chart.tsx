'use client';

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

interface EarningsSummary {
  totalEarned: number;
  pendingRewards: number;
  thisMonth: number;
  bySurvey: { surveyId: string; surveyTitle: string; amount: number }[];
  monthly: { month: string; amount: number }[];
}

const TOP_BAR_COLORS = ['#126b8a', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

/**
 * Phase GG: 受試者 wallet 月度收益視覺化
 *  - 上方：monthly trend area chart（最近 6 個月）
 *  - 下方：bySurvey top-5 條形圖
 */
export function EarningsChart({ summary }: { summary: EarningsSummary }) {
  const monthly = summary.monthly.slice(-6).map((m) => ({
    month: m.month.slice(5), // "2026-05" → "05"
    fullMonth: m.month,
    amount: m.amount,
  }));

  const topSurveys = [...summary.bySurvey]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((s, i) => ({
      label: s.surveyTitle.length > 14 ? s.surveyTitle.slice(0, 14) + '…' : s.surveyTitle,
      fullTitle: s.surveyTitle,
      amount: s.amount,
      color: TOP_BAR_COLORS[i % TOP_BAR_COLORS.length],
    }));

  const hasMonthly = monthly.length > 0;
  const hasSurveys = topSurveys.length > 0;

  if (!hasMonthly && !hasSurveys) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        尚無歷史獎勵紀錄，完成問卷後這裡會出現你的收益趨勢。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              月度收益趨勢
            </p>
            <p className="mt-0.5 text-xs text-slate-500">最近 {monthly.length} 個月</p>
          </div>
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            NT${summary.totalEarned.toLocaleString()}
            <span className="ml-1 text-[10px] font-normal text-slate-500">累計</span>
          </p>
        </div>
        <div className="h-32 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any): [string, string] => [`NT$${(v as number).toLocaleString()}`, '收益']}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(_: any, p: any) => p?.[0]?.payload?.fullMonth ?? ''}
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
      </div>

      {hasSurveys && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              貢獻最高的問卷
            </p>
            <p className="text-xs text-slate-500">Top {topSurveys.length}</p>
          </div>
          <div className="h-36 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any): [string, string] => [`NT$${(v as number).toLocaleString()}`, '收益']}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labelFormatter={(_: any, p: any) => p?.[0]?.payload?.fullTitle ?? ''}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {topSurveys.map((s) => (
                    <Cell key={s.label} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
