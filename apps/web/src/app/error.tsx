'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 上報到 server 端日誌（瀏覽器 console + 後續可接 Sentry）
    console.error('[app error]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-6xl">😵</p>
        <h1 className="mt-3 text-xl font-semibold">頁面發生錯誤</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          發生未預期的問題。你可以重試，或返回首頁。
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-muted-foreground/70">錯誤代碼：{error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          重試
        </button>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-muted"
        >
          回到首頁
        </Link>
      </div>
    </main>
  );
}
