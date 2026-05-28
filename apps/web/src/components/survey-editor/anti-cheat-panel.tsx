'use client';

import { useState } from 'react';
import {
  useAntiCheatSuggestions,
  usePreReview,
  SurveyQuestion,
  AttentionCheckSuggestion,
} from '@/hooks/use-surveys';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  surveyId: string;
  questions: SurveyQuestion[];
  onApplyChecks: (next: SurveyQuestion[]) => void;
}

export function AntiCheatPanel({ surveyId, questions, onApplyChecks }: Props) {
  const [acEnabled, setAcEnabled] = useState(false);
  const [prEnabled, setPrEnabled] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const ac = useAntiCheatSuggestions(surveyId, acEnabled);
  const pr = usePreReview(surveyId, prEnabled);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const applySelected = () => {
    if (!ac.data || selected.size === 0) return;
    const checksToApply = ac.data.checks.filter((_, i) => selected.has(i));
    // 依 insertAfterIndex 由大到小套用（避免後續 index 位移）
    const sorted = [...checksToApply].sort(
      (a, b) => b.insertAfterIndex - a.insertAfterIndex,
    );
    let next = [...questions];
    for (const c of sorted) {
      const q = checkToSurveyQuestion(c);
      const insertPos = Math.min(c.insertAfterIndex, next.length);
      next = [...next.slice(0, insertPos), q, ...next.slice(insertPos)];
    }
    // 重編 sortOrder
    next = next.map((q, i) => ({ ...q, sortOrder: i }));
    onApplyChecks(next);
    setSelected(new Set());
  };

  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-rose-50/30 p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-amber-300/20 blur-2xl" />

      <div className="relative flex items-center gap-2 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white text-lg">
          🛡️
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">AI 反作弊設計輔助</h2>
          <p className="text-[11px] text-slate-500">事先設計好「亂填會被抓」的機制，提升樣本可信度</p>
        </div>
      </div>

      {/* ─── A：加注意力檢核題 ─── */}
      <div className="relative space-y-2 mb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">✨ AI 加反作弊題</p>
          <button
            onClick={() => (acEnabled ? ac.refetch() : setAcEnabled(true))}
            disabled={ac.isLoading || ac.isFetching}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-amber-700 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {ac.isLoading || ac.isFetching ? (
              <>
                <Spinner />
                生成中…
              </>
            ) : acEnabled ? (
              '重新生成'
            ) : (
              '取得建議'
            )}
          </button>
        </div>

        {(ac.isLoading || ac.isFetching) && (
          <div className="space-y-1.5" aria-live="polite">
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <Spinner className="h-3 w-3" />
              AI 生成中，約需 20–30 秒，請稍候…
            </p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-amber-100">
              <div className="q-progress-bar h-full w-1/3 rounded-full bg-amber-600" />
            </div>
          </div>
        )}

        {!acEnabled && (
          <p className="text-xs text-slate-600">
            由 AI 為你產生 1~2 題注意力檢核題（指令型 / 常識型 / 計算型），偵測填問卷的人有沒有亂填。
          </p>
        )}

        {(ac.isLoading || ac.isFetching) && (
          <div className="space-y-1.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-200/60" />
            ))}
          </div>
        )}

        {ac.error && <p className="text-xs text-red-600">AI 暫時無法生成，請稍後重試</p>}

        {ac.data?.note && (
          <p className="rounded bg-slate-100/80 px-3 py-2 text-xs text-slate-600">
            ℹ️ {ac.data.note}
          </p>
        )}

        {ac.data && ac.data.checks.length > 0 && (
          <div className="space-y-2">
            {ac.data.checks.map((c, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selected.has(i)
                    ? 'border-amber-500 bg-amber-100/40'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className="mt-1 h-4 w-4 accent-amber-600"
                />
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      插入 Q{c.insertAfterIndex} 之後
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {labelForKind(c.question.kind)}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800">{c.question.title}</p>
                  {c.question.options && (
                    <ul className="mt-1 ml-3 text-slate-600 list-disc list-outside">
                      {c.question.options.map((o, j) => (
                        <li key={j}>{o.label}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    正解：<span className="font-mono text-amber-700">{c.question.correctValue}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400 italic">
                    {c.question.reasoning}
                  </p>
                </div>
              </label>
            ))}
            <div className="flex justify-end">
              <button
                disabled={selected.size === 0}
                onClick={applySelected}
                className="rounded-md bg-amber-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-800 disabled:opacity-50"
              >
                套用選中的 {selected.size} 題 →
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="my-3 h-px bg-amber-200/50" />

      {/* ─── B：上架前 AI 預審 ─── */}
      <div className="relative space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">🔍 上架前 AI 預審</p>
          <button
            onClick={() => (prEnabled ? pr.refetch() : setPrEnabled(true))}
            disabled={pr.isLoading || pr.isFetching}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-rose-700 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {pr.isLoading || pr.isFetching ? '審核中…' : prEnabled ? '重新預審' : '取得預審'}
          </button>
        </div>

        {!prEnabled && (
          <p className="text-xs text-slate-600">
            送審前先讓 AI 把關紅線（個資、誘導性、敏感字），把退件風險降到最低。
          </p>
        )}

        {pr.error && <p className="text-xs text-red-600">AI 暫時無法預審，請稍後重試</p>}

        {(pr.isLoading || pr.isFetching) && (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-slate-200/60" style={{ width: `${100 - i * 10}%` }} />
            ))}
          </div>
        )}

        {pr.data && !pr.isLoading && !pr.isFetching && <PreReviewBlock result={pr.data} />}
      </div>
    </section>
  );
}

function PreReviewBlock({ result }: { result: ReturnType<typeof usePreReview>['data'] }) {
  if (!result) return null;
  const decisionColor =
    result.decision === 'approve'
      ? 'bg-green-100 text-green-700'
      : result.decision === 'approve_with_changes'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-700';
  const decisionLabel =
    result.decision === 'approve'
      ? '可上架'
      : result.decision === 'approve_with_changes'
        ? '建議修改後上架'
        : '建議勿送審';

  return (
    <div className="space-y-3 rounded-lg bg-white p-3 border border-rose-200">
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className={`text-3xl font-extrabold ${
            result.score >= 80 ? 'text-green-600' :
            result.score >= 60 ? 'text-amber-600' :
            'text-red-600'
          }`}>{result.score}</div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">/ 100</div>
        </div>
        <div className="flex-1">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${decisionColor}`}>
            {decisionLabel}
          </span>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{result.summaryForSurveyor}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded bg-slate-50 p-1.5">
          <p className="font-bold text-slate-700">{result.estimatedCompletionRate}%</p>
          <p className="text-[10px] text-slate-500">預估完成率</p>
        </div>
        <div className="rounded bg-slate-50 p-1.5">
          <p className={`font-bold ${result.hasAntiCheatMechanism ? 'text-green-600' : 'text-amber-600'}`}>
            {result.hasAntiCheatMechanism ? '✓ 已有' : '⚠ 缺少'}
          </p>
          <p className="text-[10px] text-slate-500">反作弊機制</p>
        </div>
      </div>

      {result.redFlags.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1.5">
            🚩 紅線提醒（{result.redFlags.length}）
          </p>
          <ul className="space-y-1">
            {result.redFlags.map((f, i) => (
              <li key={i} className={`rounded p-2 text-xs ${
                f.severity === 'high' ? 'border border-red-300 bg-red-50/60' :
                f.severity === 'medium' ? 'border border-amber-300 bg-amber-50/60' :
                'border border-slate-200 bg-slate-50/60'
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    f.severity === 'high' ? 'bg-red-200 text-red-800' :
                    f.severity === 'medium' ? 'bg-amber-200 text-amber-800' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {f.severity.toUpperCase()}
                  </span>
                  {f.questionIndex != null && (
                    <span className="text-[10px] text-slate-500">Q{f.questionIndex}</span>
                  )}
                  <span className="font-semibold text-slate-800">{f.issue}</span>
                </div>
                <p className="text-[11px] text-slate-600">→ {f.suggestedFix}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">⚠ 警告</p>
          <ul className="space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-slate-600 pl-3">· {w}</li>
            ))}
          </ul>
        </div>
      )}

      {result.compliments.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">✅ 加分項</p>
          <ul className="space-y-0.5">
            {result.compliments.map((c, i) => (
              <li key={i} className="text-xs text-slate-600 pl-3">· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function labelForKind(kind: AttentionCheckSuggestion['question']['kind']): string {
  return kind === 'instruction' ? '指令型' : kind === 'common_sense' ? '常識型' : '計算型';
}

function checkToSurveyQuestion(c: AttentionCheckSuggestion): SurveyQuestion {
  if (c.question.type === 'single_choice') {
    return {
      type: 'single_choice',
      title: c.question.title,
      sortOrder: 0,
      isRequired: true,
      config: { isAttentionCheck: true, correctValue: c.question.correctValue, kind: c.question.kind },
      options: (c.question.options ?? []).map((o, i) => ({ label: o.label, sortOrder: i })),
    };
  }
  return {
    type: 'text',
    title: c.question.title,
    sortOrder: 0,
    isRequired: true,
    config: { isAttentionCheck: true, correctValue: c.question.correctValue, kind: c.question.kind },
  };
}
