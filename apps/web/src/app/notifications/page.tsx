'use client';

import { useRouter } from 'next/navigation';
import { useNotifications, useMarkRead, useMarkAllRead, AppNotification } from '@/hooks/use-notifications';

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  survey_approved: '✅',
  survey_rejected: '❌',
  new_response: '📝',
  reward_issued: '🎁',
  system: '📢',
};

export default function NotificationsPage() {
  const { data: items = [], isLoading, isError } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const router = useRouter();

  const unreadCount = items.filter((n) => !n.isRead).length;

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    // 導向相關頁面
    const meta = n.metadata as Record<string, string> | undefined;
    if (meta?.surveyId) {
      if (n.type === 'survey_approved' || n.type === 'survey_rejected') {
        router.push(`/dashboard/surveys/${meta.surveyId}`);
      }
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">通知</h1>
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

      {isLoading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {isError && <p className="text-sm text-destructive">載入失敗，請重新整理頁面。</p>}

      {markAllRead.isError && (
        <p className="text-sm text-destructive mb-2">標記已讀失敗，請再試一次。</p>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">目前沒有通知</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((n) => (
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
              <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[n.type]}</span>
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
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleString('zh-TW')}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
