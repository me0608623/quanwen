'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, useMarkRead, useMarkAllRead, AppNotification } from '@/hooks/use-notifications';
import { relativeTime } from '@/lib/relative-time';

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  survey_approved: '✅',
  survey_rejected: '❌',
  new_response: '📝',
  reward_issued: '🎁',
  system: '📢',
};

export default function NotificationsPage() {
  const { data: items = [], isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const router = useRouter();
  const [onlyUnread, setOnlyUnread] = useState(false);

  const unreadCount = items.filter((n) => !n.isRead).length;
  const visibleItems = onlyUnread ? items.filter((n) => !n.isRead) : items;

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    // 導向相關頁面
    const meta = n.metadata as Record<string, string> | undefined;
    if (meta?.pairId) {
      // 互惠系統通知（matched / a_filled / unlocked / cancelled / expired）
      router.push(`/mutual/${meta.pairId}`);
      return;
    }
    if (meta?.surveyId) {
      if (n.type === 'survey_approved' || n.type === 'survey_rejected') {
        // 草稿/退回 → 編輯器
        router.push(`/dashboard/surveys/${meta.surveyId}`);
      } else if (n.type === 'new_response') {
        // 收到新回應 → 問卷分析
        router.push(`/dashboard/surveys/${meta.surveyId}/stats`);
      }
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">通知</h1>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={`text-sm hover:underline ${onlyUnread ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
            >
              只看未讀{unreadCount > 0 ? `（${unreadCount}）` : ''}
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-sm text-primary hover:underline"
            >
              全部標為已讀
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-border p-4">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">載入失敗。</p>
          <button
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            重試
          </button>
        </div>
      )}

      {markAllRead.isError && (
        <p className="text-sm text-destructive mb-2">標記已讀失敗，請再試一次。</p>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有通知</p>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && onlyUnread && visibleItems.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          目前沒有未讀通知。
        </p>
      )}

      <div className="space-y-2">
        {visibleItems.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={[
              'w-full text-left rounded-lg border p-4 transition-colors',
              n.isRead
                ? 'border-border bg-background'
                : 'border-primary/30 bg-primary/5',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">
                {(n.metadata as Record<string, unknown> | undefined)?.pairId ? '🤝' : TYPE_ICONS[n.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-medium truncate ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                {n.body && (
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.body}</p>
                )}
                <p className="text-xs text-slate-600 mt-1">
                  {relativeTime(n.createdAt)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
