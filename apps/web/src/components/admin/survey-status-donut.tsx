'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import type {
  Formatter,
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';

const formatShares: Formatter<ValueType, NameType> = (value, name) => [
  `${value} 份`,
  String(name ?? ''),
];

interface Props {
  counts: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending_review: '待審核',
  published: '已發布',
  paused: '暫停中',
  closed: '已關閉',
  rejected: '已拒絕',
};

// 與 stats/charts.tsx 同色系，保持視覺一致
const COLORS: Record<string, string> = {
  draft: '#94a3b8',
  pending_review: '#f59e0b',
  published: '#126b8a',
  paused: '#a78bfa',
  closed: '#64748b',
  rejected: '#ef4444',
};

/**
 * Phase FF: 平台問卷狀態分佈 — recharts donut，配合 admin overview StatCards。
 */
export function SurveyStatusDonut({ counts }: Props) {
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([status, value]) => ({
      status,
      name: STATUS_LABEL[status] ?? status,
      value,
    }));

  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        尚無問卷資料
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          問卷狀態分佈
        </p>
        <p className="text-xs text-muted-foreground">總計 {total}</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={70}
              paddingAngle={2}
              label={(props) => {
                const pct = (props as { percent?: number }).percent ?? 0;
                return pct > 0.06 ? `${Math.round(pct * 100)}%` : '';
              }}
              labelLine={false}
            >
              {data.map((d) => (
                <Cell key={d.status} fill={COLORS[d.status] ?? '#cbd5e1'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
              }}
              formatter={formatShares}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
