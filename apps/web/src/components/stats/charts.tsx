'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from 'recharts';

/**
 * Phase V: stats 頁視覺化 — recharts BarChart / PieChart 替代 CSS-only bars
 */

const PALETTE = ['#126b8a', '#0F2A5C', '#8B5CF6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

interface OptionDatum {
  optionId?: string;
  label: string;
  count: number;
}

/** 單選 / 多選 題的選項計數 — 水平 BarChart */
export function OptionBarChart({ data, totalAnswers }: { data: OptionDatum[]; totalAnswers: number }) {
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => b.count - a.count);
  // 標 percent 在 bar 上
  const dataWithPct = sorted.map((d) => ({
    ...d,
    pct: totalAnswers > 0 ? Math.round((d.count / totalAnswers) * 100) : 0,
  }));
  const height = Math.max(120, dataWithPct.length * 38 + 20);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={dataWithPct} layout="vertical" margin={{ top: 5, right: 60, left: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fontSize: 12, fill: '#475569' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(18,107,138,0.04)' }}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, _name: any, ctx: any): [string, string] =>
              [`${value} 票 (${ctx?.payload?.pct ?? 0}%)`, '票數']
            }
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {dataWithPct.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => `${v}%`}
              style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Quality distribution 3-tier donut */
export function QualityDonut({
  passed,
  suspicious,
  rejected,
  unaudited,
}: {
  passed: number;
  suspicious: number;
  rejected: number;
  unaudited: number;
}) {
  const data = [
    { name: '通過', value: passed, color: '#10b981' },
    { name: '疑似', value: suspicious, color: '#f59e0b' },
    { name: '退件', value: rejected, color: '#ef4444' },
    { name: '未審', value: unaudited, color: '#94a3b8' },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-xs text-slate-500 italic">尚無填答資料</p>;
  }

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any): [string, string] => [`${value} 份`, '']}
          />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconSize={10}
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rating 題的 1..N 分布（簡化版：用 平均 + bar 顯示） */
export function RatingDistribution({ buckets }: { buckets: { value: number; count: number }[] }) {
  if (buckets.length === 0) return null;
  return (
    <div style={{ width: '100%', height: 180 }}>
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
          <XAxis dataKey="value" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any): [string, string] => [`${value} 人`, '']}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={(label: any) => `${label} 分`}
          />
          <Bar dataKey="count" fill="#126b8a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
