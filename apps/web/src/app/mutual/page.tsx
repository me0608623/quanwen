'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useMatchMutualByCode,
  useMyMutualPairs,
  useMutualPool,
  useMutualPoolStats,
  useMyMutualStats,
  type MutualPair,
  type MutualPoolItem,
} from '@/hooks/use-mutual';

const ACTION_LABEL: Record<MutualPair['nextAction'], { label: string; tone: string }> = {
  wait_match:      { label: '配對中', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  fill_other:      { label: '輪到你填', tone: 'bg-primary/10 text-blue-700 border-primary/30' },
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
  const router = useRouter();
  const [showRules, setShowRules] = useState(false);
  const [matchCode, setMatchCode] = useState('');
  const { data: pairs, isLoading, error, failureCount } = useMyMutualPairs();
  const { data: poolItems } = useMutualPool();
  const { data: pool } = useMutualPoolStats();
  const { data: myStats } = useMyMutualStats();
  const matchByCode = useMatchMutualByCode();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        {failureCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            連線中斷，正在重試... ({failureCount}/3)
          </div>
        )}
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-background p-4">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (error && !pairs) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p>連線失敗，3 次重試後仍無法載入。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/5"
          >
            重新整理
          </button>
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

  const handleMatchByCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const result = await matchByCode.mutateAsync(trimmed);
      router.push(`/mutual/${result.pairId}`);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '配對失敗，請確認編號是否仍在配對池中');
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      {error && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <span>連線中斷，顯示上次資料。</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-amber-100"
          >
            重新整理
          </button>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🤝 互惠問卷</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            兩個人都有問卷，互相填寫對方的，AI 審過就同時解鎖看對方填答。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            互惠問卷規則
          </button>
          <Link
            href="/dashboard/surveys/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + 發佈互惠問卷
          </Link>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold tracking-wide">指定互惠問卷編號</h2>
          <p className="text-xs text-muted-foreground">
            可輸入朋友給你的互惠編號，或下方列表中的問卷 ID，系統會用你已發佈且配對中的互惠問卷建立配對。
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleMatchByCode(matchCode);
          }}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row"
        >
          <input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            placeholder="輸入互惠編號或問卷 ID"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={matchByCode.isPending || !matchCode.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {matchByCode.isPending ? '配對中...' : '指定填寫'}
          </button>
        </form>
      </section>

      {list.length === 0 && <EmptyState />}

      <Section title="可選擇的互惠問卷" subtitle="從已發佈且等待配對的問卷中挑一份，填完後等對方也完成即可解鎖">
        {poolItems && poolItems.length > 0 ? (
          poolItems.map((item) => (
            <PoolCard
              key={item.id}
              item={item}
              isPending={matchByCode.isPending}
              onSelect={() => handleMatchByCode(item.id)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            目前沒有其他人等待配對的互惠問卷。你可以先發佈自己的互惠問卷，或請朋友提供互惠編號。
          </div>
        )}
      </Section>

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

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">互惠問卷規則</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              雙方都持有互惠問卷，互相完成對方問卷並通過 AI 品質審核後，同時解鎖彼此填答。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
            aria-label="關閉互惠問卷規則"
          >
            X
          </button>
        </div>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li><span className="font-semibold text-foreground">1.</span> 先發佈一份類型為互惠的問卷，問卷會進入配對池。</li>
          <li><span className="font-semibold text-foreground">2.</span> 可等待系統自動配對，也可從列表選別人的問卷，或輸入朋友提供的互惠編號。</li>
          <li><span className="font-semibold text-foreground">3.</span> 你填完對方問卷後，對方會在進行中看到「對方已填寫完畢，請盡快填寫對方的問卷」。</li>
          <li><span className="font-semibold text-foreground">4.</span> 兩邊填答都通過 AI 審核後，才會同時解鎖彼此答案；任何一方退件會取消配對。</li>
        </ol>
      </div>
    </div>
  );
}

function PairCard({ pair }: { pair: MutualPair }) {
  const action = STATUS_LABEL[pair.status] ?? ACTION_LABEL[pair.nextAction];
  const canFill = pair.nextAction === 'fill_other';
  const canView = pair.nextAction === 'unlocked';
  const remaining = formatRemaining(pair.expiresAt);
  const otherAlreadyFilledMine = canFill && !!pair.self.filledAt;

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
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">互惠編號 {pair.id}</span>
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">問卷 ID {pair.self.surveyId}</span>
          </div>

          {otherAlreadyFilledMine && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              對方已填寫完畢，請盡快填寫對方的問卷後獲得對方問卷答案。
            </div>
          )}

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

function PoolCard({
  item,
  isPending,
  onSelect,
}: {
  item: MutualPoolItem;
  isPending: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">互惠編號 {item.id}</span>
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">問卷 ID {item.surveyId}</span>
            {item.category && <span>{item.category}</span>}
          </div>
          <p className="font-semibold">{item.surveyTitle}</p>
          {item.surveyDescription && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.surveyDescription}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            發佈者 {item.owner.displayName}
            {item.owner.reputationScore !== null && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                信譽 {item.owner.reputationScore}
              </span>
            )}
            <span className="ml-2">發佈於 {formatRelative(item.createdAt)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onSelect}
          disabled={isPending}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          選擇並填寫
        </button>
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
