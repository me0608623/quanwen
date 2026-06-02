'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export interface TrendPoint {
  date: string;
  count: number;
}

/**
 * 近 14/30 天填答趨勢 — recharts AreaChart
 * Data comes from GET /surveys/:id/trend
 */
export function TrendLineChart({ data }: { data: TrendPoint[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground italic">尚無趨勢資料</p>;
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer height={200}>
        <AreaChart data={formatted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#126b8a" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#126b8a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
            formatter={(value) => [`${value} 份`, '填答']}
            labelFormatter={(label) => `${label}`}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#126b8a"
            strokeWidth={2}
            fill="url(#trendGradient)"
            dot={{ r: 3, fill: '#126b8a', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#126b8a', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
