'use client';

import Link from 'next/link';
import { useMyMutualPairs, useMutualPoolStats, useMyMutualStats, type MutualPair } from '@/hooks/use-mutual';

const ACTION_LABEL: Record<MutualPair['nextAction'], { label: string; tone: string }> = {
  wait_match:      { label: '配對中', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  fill_other:      { label: '輪到你填', tone: 'bg-primary/10 text-primary border-primary/30' },
  wait_other_fill: { label: '等對方填', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  unlocked:        { label: '已解鎖', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  expired_or_dead: { label: '結束', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const STATUS_LABEL: Partial<Record<MutualPair['status'], { label: string; tone: string }>> = {
  cancelled: { label: 'AI 退件', tone: 'bg-red-100 text-red-700 border-red-200' },
  expired:   { label: '超時',    tone: 'bg-slate-200 text-slate-600 border-slate-300' },
};

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '已超時';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 24) return `剩 ${Math.floor(hours / 24)} 天`;
  return `剩 ${hours} 小時`;
}

function formatRelative(at: string | null | undefined): string {
  if (!at) return '';
  const ms = Date.now() - new Date(at).getTime();
  if (ms < 60_000) return '剛剛';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function MutualPage() {
  const { data: pairs, isLoading, error } = useMyMutualPairs();
  const { data: pool } = useMutualPoolStats();
  const { data: myStats } = useMyMutualStats();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="text-muted-foreground">載入中…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          載入失敗。請稍後重試或回 dashboard。
        </div>
      </main>
    );
  }

  const list = pairs ?? [];
  const waiting = list.filter((p) => p.status === 'waiting');
  const active = list.filter((p) => ['matched', 'a_done', 'b_done'].includes(p.status));
  const done = list.filter((p) => p.status === 'both_done');
  const cancelled = list.filter((p) => p.status === 'cancelled');
  const expired = list.filter((p) => p.status === 'expired');

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🤝 互惠問卷</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            兩個人都有問卷，互相填寫對方的，AI 審過就同時解鎖看對方填答。
          </p>
        </div>
        <Link
          href="/dashboard/surveys/new"
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          + 發佈互惠問卷
        </Link>
      </div>

      {/* Pool stats */}
      {pool && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>目前 <span className="font-bold">{pool.waiting}</span> 份問卷在配對池中</span>
            {pool.myWaiting > 0 && (
              <span className="text-muted-foreground">
                · 你有 {pool.myWaiting} 份等配對
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">每 30 秒掃一次</span>
        </div>
      )}

      {/* My stats */}
      {myStats && myStats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="累計配對" value={myStats.total} />
          <StatTile label="已解鎖" value={myStats.byStatus.both_done ?? 0} tone="emerald" />
          <StatTile label="進行中" value={(myStats.byStatus.matched ?? 0) + (myStats.byStatus.a_done ?? 0) + (myStats.byStatus.b_done ?? 0)} tone="blue" />
          <StatTile label="成功率" value={`${myStats.successRate}%`} tone="amber" />
        </div>
      )}

      {list.length === 0 && <EmptyState />}

      {active.length > 0 && (
        <Section title="🔥 進行中" subtitle="配對成功，至少有一方該動作">
          {active.map((p) => <PairCard key={p.id} pair={p} />)}
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="⏳ 配對中" subtitle="等系統幫你找到對手（每 30 秒掃一次）">
          {waiting.map((p) => <PairCard key={p.id} pair={p} />)}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="✅ 已解鎖" subtitle="雙方都已完成，可看對方填答">
          {done.map((p) => <PairCard key={p.id} pair={p} />)}
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section title="🚫 AI 退件" subtitle="填答品質未通過 AI 審核, 配對取消">
          {cancelled.map((p) => <PairCard key={p.id} pair={p} />)}
        </Section>
      )}

      {expired.length > 0 && (
        <Section title="⌛ 超時" subtitle="72 小時內未完成">
          {expired.map((p) => <PairCard key={p.id} pair={p} />)}
        </Section>
      )}
    </main>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function PairCard({ pair }: { pair: MutualPair }) {
  const action = STATUS_LABEL[pair.status] ?? ACTION_LABEL[pair.nextAction];
  const canFill = pair.nextAction === 'fill_other';
  const canView = pair.nextAction === 'unlocked';
  const remaining = formatRemaining(pair.expiresAt);

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 flex-wrap">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${action.tone}`}>
              {action.label}
            </span>
            {remaining && pair.status !== 'waiting' && pair.status !== 'both_done' && (
              <span className="text-[11px] text-muted-foreground">{remaining}</span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {pair.matchedAt ? `配對於 ${formatRelative(pair.matchedAt)}` : `發佈於 ${formatRelative(pair.createdAt)}`}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">我的問卷</p>
          <p className="font-semibold truncate">{pair.self.surveyTitle}</p>

          {pair.other ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                對方 ({pair.other.displayName}) 的問卷
                {pair.other.reputationScore !== null && (
                  <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    ⭐ {pair.other.reputationScore}
                  </span>
                )}
              </p>
              <p className="text-sm truncate">{pair.other.surveyTitle}</p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground italic">尚未配對到對手</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          {canFill && (
            <Link
              href={`/mutual/${pair.id}`}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              去填寫 →
            </Link>
          )}
          {canView && (
            <Link
              href={`/mutual/${pair.id}`}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              查看填答
            </Link>
          )}
          {pair.nextAction === 'wait_other_fill' && (
            <span className="text-[11px] text-muted-foreground italic">
              {pair.other?.displayName ?? '對方'} 還沒填
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone?: 'emerald' | 'blue' | 'amber' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-700' :
    tone === 'blue'    ? 'text-blue-700' :
    tone === 'amber'   ? 'text-amber-700' :
    'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">
        🤝
      </div>
      <h2 className="mb-2 text-base font-bold">還沒有互惠配對</h2>
      <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
        到「發問卷」建立一份問卷，類型選「互惠」，系統就會自動幫你配對另一個有問卷的人。
      </p>
      <Link
        href="/dashboard/surveys/new"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        建立互惠問卷
      </Link>
    </div>
  );
}
