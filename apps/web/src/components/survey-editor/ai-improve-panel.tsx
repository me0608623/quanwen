'use client';

import { useState } from 'react';
import { useAiUsage, useSurveyAiImprove } from '@/hooks/use-surveys';

export function AiImprovePanel({ surveyId }: { surveyId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useSurveyAiImprove(surveyId, enabled);
  const { data: usage } = useAiUsage();

  return (
    <section className="relative overflow-hidden rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#0F2A5C]/[0.03] via-[#126b8a]/[0.05] to-[#8B5CF6]/[0.04] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#126b8a]/10 blur-2xl" />

      <div className="relative flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#126b8a] to-[#8B5CF6] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">AI 優化建議</h2>
            <p className="text-[11px] text-slate-500">由 LLM 給現有問卷的具體改進方向</p>
          </div>
        </div>
        <button
          onClick={() => (enabled ? refetch() : setEnabled(true))}
          disabled={isLoading || isFetching}
          className="rounded-md bg-[#126b8a] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isLoading || isFetching ? '分析中…' : enabled ? '重新生成' : '取得建議'}
        </button>
      </div>

      {usage && (
        <p className="mb-3 text-[11px] text-slate-500">
          {usage.tier.toUpperCase()} 方案 · 今日 AI 優化剩餘{' '}
          {Number.isFinite(usage.remaining.optimizeSurvey) ? usage.remaining.optimizeSurvey : '∞'}/
          {Number.isFinite(usage.limits.optimizeSurvey) ? usage.limits.optimizeSurvey : '∞'} 次
        </p>
      )}

      {!enabled && !data && (
        <p className="relative text-sm text-slate-600">
          點擊「取得建議」由 AI 分析你的問卷並提供具體改進方向
        </p>
      )}

      {(isLoading || isFetching) && (
        <div className="relative space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${100 - i * 8}%` }} />
          ))}
        </div>
      )}

      {error && <p className="relative text-sm text-red-600">AI 服務暫時無法使用</p>}

      {data && !isLoading && !isFetching && (
        <div className="relative space-y-4">
          {/* Score header */}
          <div className="flex items-center gap-4 rounded-lg bg-white p-4 border border-[#126b8a]/15">
            <div className="text-center">
              <div className={`text-4xl font-extrabold ${
                data.overallScore >= 80 ? 'text-green-600' :
                data.overallScore >= 60 ? 'text-amber-600' :
                'text-red-600'
              }`}>{data.overallScore}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">/ 100</div>
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">問卷整體品質</p>
              <p className="text-sm font-semibold text-slate-700">
                {data.overallScore >= 80 ? '優良，可直接上架' :
                 data.overallScore >= 60 ? '可接受，有改進空間' :
                 '需要重新檢視'}
              </p>
            </div>
          </div>

          {/* 4 columns */}
          <div className="grid gap-3 md:grid-cols-2">
            {data.strengths.length > 0 && (
              <Block label="✅ 優點" items={data.strengths} accent="green" />
            )}
            {data.missingTypes.length > 0 && (
              <Block label="📋 建議補充" items={data.missingTypes} accent="blue" />
            )}
          </div>

          {data.weaknesses.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                🔧 具體改進建議
              </p>
              <ul className="space-y-1.5">
                {data.weaknesses.map((w, i) => (
                  <li key={i} className="rounded bg-white p-3 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {w.questionIndex === 0 ? '整體' : `Q${w.questionIndex}`}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{w.issue}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">→ {w.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.wordingTips.length > 0 && (
            <Block label="✍️ 表達建議" items={data.wordingTips} accent="purple" />
          )}
        </div>
      )}
    </section>
  );
}

function Block({ label, items, accent }: {
  label: string;
  items: string[];
  accent: 'green' | 'blue' | 'purple';
}) {
  const cls = {
    green: 'border-l-green-400 bg-green-50/60',
    blue: 'border-l-[#126b8a] bg-[#126b8a]/[0.05]',
    purple: 'border-l-violet-400 bg-violet-50/60',
  }[accent];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`border-l-2 ${cls} pl-2 py-1 text-xs text-slate-700 rounded-r`}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
