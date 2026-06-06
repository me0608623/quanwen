'use client';

import { useState } from 'react';
import { useReconciliation } from '@/hooks/use-admin-audit';
import { extractApiError } from '@/lib/extract-error';

function money(n: number) {
  return `NT$${n.toLocaleString()}`;
}

export default function AdminReconciliationPage() {
  const [enabled, setEnabled] = useState(false);
  const query = useReconciliation(enabled);
  const report = query.data;
  const hasFail = report?.invariants.some((item) => !item.pass) ?? false;

  const run = () => {
    if (!enabled) {
      setEnabled(true);
    } else {
      query.refetch();
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">對帳</h1>
          <p className="mt-1 text-sm text-muted-foreground">每次執行會即時掃描全部帳本</p>
        </div>
        <button
          onClick={run}
          disabled={query.isLoading || query.isFetching}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {query.isLoading || query.isFetching ? '執行中…' : '執行對帳'}
        </button>
      </div>

      {hasFail && (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          偵測到帳務不一致，請立即檢查失敗項目與不平衡交易。
        </div>
      )}

      {query.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {extractApiError(query.error, '對帳執行失敗')}
        </div>
      )}

      {!enabled && !report && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">按下「執行對帳」開始掃描帳本</p>
        </div>
      )}

      {(query.isLoading || query.isFetching) && <p className="text-sm text-muted-foreground">載入中…</p>}

      {report && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">產生時間：{new Date(report.generatedAt).toLocaleString('zh-TW')}</p>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TotalCard label="綠界保管款" value={money(report.totals.escrowEcpay)} />
            <TotalCard label="錢包總和" value={money(report.totals.walletSum)} />
            <TotalCard label="平台手續費收入" value={money(report.totals.platformFeeRevenue)} />
            <TotalCard label="未結獎勵應付" value={money(report.totals.rewardPayableOutstanding)} />
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold">帳務不變式</h2>
            {report.invariants.length === 0 ? (
              <p className="text-sm text-muted-foreground">沒有可檢查的不變式</p>
            ) : (
              <div className="space-y-3">
                {report.invariants.map((item) => {
                  const diff = item.actual - item.expected;
                  return (
                    <div key={item.label} className={`rounded-md border px-4 py-3 ${item.pass ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`font-medium ${item.pass ? 'text-green-800' : 'text-red-800'}`}>
                            {item.pass ? '✓' : '✕'} {item.label}
                          </p>
                          {item.note && <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>}
                        </div>
                        <div className="text-right text-sm tabular-nums">
                          <p>Expected {money(item.expected)}</p>
                          <p>Actual {money(item.actual)}</p>
                          <p className={diff === 0 ? 'text-muted-foreground' : 'font-semibold text-red-700'}>差額 {money(diff)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-base font-semibold">不平衡交易</h2>
            {report.unbalancedTransactions.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-border p-10 text-center">
                <p className="text-muted-foreground">無不平衡交易 ✓</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">交易 ID</th>
                      <th className="py-2 font-medium">Debit</th>
                      <th className="py-2 font-medium">Credit</th>
                      <th className="py-2 font-medium">差額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unbalancedTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-border last:border-0">
                        <td className="py-2 font-mono text-xs">{tx.id}</td>
                        <td className="py-2 tabular-nums">{money(tx.debit)}</td>
                        <td className="py-2 tabular-nums">{money(tx.credit)}</td>
                        <td className="py-2 font-semibold text-red-700 tabular-nums">{money(tx.debit - tx.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
