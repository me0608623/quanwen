'use client';

import { useMemo, useState } from 'react';
import { useNps, type NpsResult } from '@/hooks/use-analytics';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

// ─── NPS Gauge Component ───────────────────────────────────────────────────

function NpsScore({ nps }: { nps: number | null }) {
  if (nps === null) return null;

  const color =
    nps >= 50 ? 'text-green-600' :
    nps >= 0 ? 'text-amber-600' :
    'text-red-600';

  const label =
    nps >= 70 ? '優秀' :
    nps >= 50 ? '很好' :
    nps >= 0 ? '一般' :
    '需改善';

  return (
    <div className="text-center">
      <p className={`text-4xl font-extrabold ${color}`}>{nps}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function NpsBar({ promoters, passives, detractors, total }: {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}) {
  if (total === 0) return null;
  const promPct = (promoters / total) * 100;
  const passPct = (passives / total) * 100;
  const detPct = (detractors / total) * 100;

  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full border border-slate-200">
        {detPct > 0 && (
          <div className="bg-red-400 transition-all" style={{ width: `${detPct}%` }} title={`貶損者 ${detractors}`} />
        )}
        {passPct > 0 && (
          <div className="bg-slate-300 transition-all" style={{ width: `${passPct}%` }} title={`被動者 ${passives}`} />
        )}
        {promPct > 0 && (
          <div className="bg-green-400 transition-all" style={{ width: `${promPct}%` }} title={`推薦者 ${promoters}`} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-red-700">😟 貶損者 {detractors}</span>
        <span className="text-slate-600">😐 被動者 {passives}</span>
        <span className="text-green-700">😊 推薦者 {promoters}</span>
      </div>
    </div>
  );
}

const DONUT_COLORS = ['#10b981', '#94a3b8', '#ef4444'];
const DONUT_LABELS = ['推薦者', '被動者', '貶損者'];

function NpsDonut({ promoters, passives, detractors }: {
  promoters: number;
  passives: number;
  detractors: number;
}) {
  const data = [
    { name: '推薦者', value: promoters },
    { name: '被動者', value: passives },
    { name: '貶損者', value: detractors },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer height={160}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={40}
            outerRadius={65}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[DONUT_LABELS.indexOf(data[i].name)]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}
            formatter={(value) => [`${value} 人`, '']}
          />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconSize={10}
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NpsGauge({ data }: { data: NpsResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr,180px] items-center">
        <div className="space-y-3">
          <NpsScore nps={data.nps} />
          <NpsBar
            promoters={data.promoters}
            passives={data.passives}
            detractors={data.detractors}
            total={data.total}
          />
        </div>
        <NpsDonut
          promoters={data.promoters}
          passives={data.passives}
          detractors={data.detractors}
        />
      </div>
      <p className="text-right text-[10px] text-muted-foreground">
        共 {data.total} 份回應
      </p>
      <p className="text-[10px] text-muted-foreground">
        原始量尺 {data.scaleMin}-{data.scaleMax}
        {data.normalizedToTenPointScale
          ? '，已線性換算為 0-10 後套用 NPS 分類。'
          : '，直接套用 NPS 分類。'}
      </p>
    </div>
  );
}

// ─── Section wrapper for stats page ─────────────────────────────────────────

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
  totalAnswers: number;
}

export function NpsSection({ questionStats, surveyId }: { questionStats: QuestionStat[]; surveyId: string }) {
  const ratingQuestions = useMemo(
    () => questionStats.filter((q) => q.type === 'rating'),
    [questionStats],
  );

  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const selectedRating = ratingQuestions.find((question) => question.questionId === selectedQuestionId);

  const { data, isLoading, error } = useNps(surveyId, selectedRating?.questionId, !!selectedRating);

  if (ratingQuestions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border p-5 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        NPS 淨推薦值
      </h2>
      <p className="text-xs text-muted-foreground">
        請選擇「推薦意願」評分題；一般滿意度題不等同 NPS。
      </p>
      <select
        value={selectedRating?.questionId ?? ''}
        onChange={(event) => setSelectedQuestionId(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        aria-label="NPS 推薦意願題"
      >
        <option value="">請選擇推薦意願題</option>
        {ratingQuestions.map((question) => (
          <option key={question.questionId} value={question.questionId}>{question.title}</option>
        ))}
      </select>

      {!selectedRating && <p className="text-xs font-semibold text-amber-700">選定推薦意願題後才會計算 NPS，避免將一般滿意度誤當成推薦值。</p>}
      {isLoading && <div className="h-24 animate-pulse rounded bg-muted" />}
      {error && <p className="text-xs text-red-600">NPS 計算失敗</p>}
      {data && !isLoading && <NpsGauge data={data} />}
    </section>
  );
}
