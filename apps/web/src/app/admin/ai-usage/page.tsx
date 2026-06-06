'use client';

import { useState } from 'react';
import { useAiUsage } from '@/hooks/use-admin-audit';
import { extractApiError } from '@/lib/extract-error';

const DAY_OPTIONS = [7, 30, 90];

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
}

export default function AdminAiUsagePage() {
  const [days, setDays] = useState(30);
  const query = useAiUsage(days);
  const data = query.data;
  const maxDailyCost = Math.max(...(data?.daily.map((d) => d.estCostUsd) ?? [0]), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI 成本監控</h1>
          <p className="mt-1 text-sm text-muted-foreground">追蹤 LLM 呼叫量、錯誤率與估算成本</p>
        </div>
        <div className="flex rounded-md border border-border p-1">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setDays(option)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${days === option ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {option} 天
            </button>
          ))}
        </div>
      </div>

      {query.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(query.error, 'AI 使用量載入失敗')}
        </div>
      )}

      {query.isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!query.isLoading && data && data.totals.calls === 0 && (
        <div className="mb-5 rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前區間沒有 AI 使用紀錄</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="呼叫數" value={data.totals.calls.toLocaleString()} />
            <Metric label="總 Tokens" value={data.totals.totalTokens.toLocaleString()} />
            <Metric label="錯誤數" value={data.totals.errors.toLocaleString()} />
            <Metric label="快取命中" value={data.totals.cacheHits.toLocaleString()} />
            <Metric label="成本 USD" value={`US$${data.totals.estCostUsd.toFixed(4)}`} />
            <Metric label="成本 NT$" value={money(Math.round(data.totals.estCostTwd))} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">依模型</h2>
              {data.byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground">沒有模型資料</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">模型</th>
                      <th className="py-2 font-medium">呼叫</th>
                      <th className="py-2 font-medium">Tokens</th>
                      <th className="py-2 font-medium">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((item) => (
                      <tr key={item.model} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{item.model}</td>
                        <td className="py-2 tabular-nums">{item.calls.toLocaleString()}</td>
                        <td className="py-2 tabular-nums">{item.totalTokens.toLocaleString()}</td>
                        <td className="py-2 tabular-nums">US${item.estCostUsd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-base font-semibold">依 Prompt Key</h2>
              {data.byPromptKey.length === 0 ? (
                <p className="text-sm text-muted-foreground">沒有 prompt 資料</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">Prompt Key</th>
                        <th className="py-2 font-medium">呼叫</th>
                        <th className="py-2 font-medium">Tokens</th>
                        <th className="py-2 font-medium">Latency</th>
                        <th className="py-2 font-medium">錯誤率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPromptKey.map((item) => {
                        const rate = item.errorRate * 100;
                        return (
                          <tr key={item.promptKey} className="border-b border-border last:border-0">
                            <td className="py-2 font-medium">{item.promptKey}</td>
                            <td className="py-2 tabular-nums">{item.calls.toLocaleString()}</td>
                            <td className="py-2 tabular-nums">{item.totalTokens.toLocaleString()}</td>
                            <td className="py-2 tabular-nums">{Math.round(item.avgLatencyMs).toLocaleString()} ms</td>
                            <td className={`py-2 font-semibold tabular-nums ${rate > 10 ? 'text-red-600' : 'text-green-700'}`}>
                              {rate.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold">每日成本</h2>
            {data.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">沒有每日資料</p>
            ) : (
              <div className="space-y-3">
                {data.daily.map((day) => {
                  const width = maxDailyCost > 0 ? Math.max(2, (day.estCostUsd / maxDailyCost) * 100) : 2;
                  return (
                    <div key={day.date} className="grid grid-cols-[92px_1fr_88px] items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground">{day.date}</span>
                      <div className="h-5 rounded bg-muted">
                        <div className="h-5 rounded bg-[#126b8a]" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right text-xs tabular-nums">US${day.estCostUsd.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
