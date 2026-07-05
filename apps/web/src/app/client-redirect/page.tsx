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
      const Capacitor = (window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }).Capacitor;
      const isNative = Capacitor?.isNativePlatform?.() ?? false;
      const isCapacitorUA = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('capacitor');

      // App 內未登入：直接進登入頁，避免 / ↔ /client-redirect 來回跳轉
      if (isNative || isCapacitorUA) {
        router.replace('/auth/login?mobile=1');
      } else {
        // Web 未登入：顯示 Landing Page
        router.replace('/');
      }
    }
  }, [me, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--q-canvas)]">
      <div className="text-[var(--q-muted)]">載入中…</div>
    </div>
  );
}