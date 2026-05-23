'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Dot,
} from 'recharts';

export interface ReputationHistoryEntry {
  id: string;
  delta: number;
  newScore: number;
  reason: string;
  createdAt: string;
}

interface Props {
  history: ReputationHistoryEntry[];
}

interface ChartPoint {
  index: number;
  score: number;
  delta: number;
  reason: string;
  date: string;
}

/**
 * Phase EE: 信譽分趨勢 — 用 recharts 取代手刻 SVG sparkline。
 *
 * - 最新 10 筆變動，時間升序（左舊右新）
 * - 線條 + 漸層 area
 * - 點顏色：正/負/0 三色
 * - 滑鼠 hover 顯示「日期 + 變動原因 + delta」tooltip
 * - Y 軸固定 [0, 100]（信譽分滿區間）
 * - 60 分基準線（dev seed default）
 */
export function ReputationTrend({ history }: Props) {
  if (!history.length) return null;

  // history is desc-by-createdAt（最新在前）。趨勢圖要時間升序。
  const points: ChartPoint[] = [...history]
    .reverse()
    .slice(-10)
    .map((h, i) => ({
      index: i,
      score: h.newScore,
      delta: h.delta,
      reason: h.reason,
      date: new Date(h.createdAt).toLocaleDateString('zh-TW', {
        month: 'numeric',
        day: 'numeric',
      }),
    }));

  const latest = points[points.length - 1]!;
  const baseline = 60;

  return (
    <div className="mt-3 rounded border border-slate-200 bg-white/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            信譽分趨勢（最近 {points.length} 次變動）
          </p>
          <p className="text-xs text-slate-600">
            最新：<span className="font-semibold text-slate-900">{latest.score}</span> 分
            {latest.delta !== 0 && (
              <span
                className={`ml-1.5 text-[10px] font-mono ${
                  latest.delta > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {latest.delta > 0 ? '+' : ''}
                {latest.delta}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="h-24 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <defs>
              <linearGradient id="repTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#126b8a" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#126b8a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={24}
              ticks={[0, 50, 100]}
            />
            <ReferenceLine
              y={baseline}
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={(props: any) => {
                if (!props.active || !props.payload?.length) return null;
                const p = props.payload[0].payload as ChartPoint;
                return (
                  <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-[11px]">
                    <p className="text-slate-500">{p.date}</p>
                    <p className="text-slate-700 font-medium">
                      {p.score} 分{' '}
                      <span
                        className={`font-mono ${
                          p.delta > 0
                            ? 'text-green-600'
                            : p.delta < 0
                              ? 'text-red-600'
                              : 'text-slate-500'
                        }`}
                      >
                        ({p.delta > 0 ? '+' : ''}
                        {p.delta})
                      </span>
                    </p>
                    <p className="text-slate-500 truncate max-w-[180px]">{p.reason}</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#126b8a"
              strokeWidth={1.5}
              fill="url(#repTrendFill)"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dot={(props: any) => {
                const p = props.payload as ChartPoint;
                const color =
                  p.delta > 0 ? '#16a34a' : p.delta < 0 ? '#dc2626' : '#64748b';
                return (
                  <Dot
                    key={`dot-${p.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={2.5}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              }}
              activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-0.5">
        {history.slice(0, 5).map((h) => (
          <li key={h.id} className="flex items-center justify-between text-[11px]">
            <span className="truncate flex-1 mr-2 text-slate-600">{h.reason}</span>
            <span
              className={`font-mono font-bold ${
                h.delta > 0
                  ? 'text-green-600'
                  : h.delta < 0
                    ? 'text-red-600'
                    : 'text-slate-500'
              }`}
            >
              {h.delta > 0 ? '+' : ''}
              {h.delta} → {h.newScore}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
