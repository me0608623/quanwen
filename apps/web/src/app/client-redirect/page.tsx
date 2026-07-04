'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';

export default function ClientRedirect() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;

    if (me) {
      const seenIntro = localStorage.getItem('quanwen_intro_seen');
      if (!seenIntro) {
        router.replace('/intro');
      } else {
        router.replace('/tasks');
      }
    } else {
      // 未登入：顯示 Landing Page
      router.replace('/');
    }
  }, [me, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--q-canvas)]">
      <div className="text-[var(--q-muted)]">載入中…</div>
    </div>
  );
}