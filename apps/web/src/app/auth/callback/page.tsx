'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthUser } from '@/hooks/use-auth';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    localStorage.setItem('qw_token', token);

    api
      .get<AuthUser>('/auth/me')
      .then(({ data }) => {
        queryClient.setQueryData(['auth', 'me'], data);
        router.replace(data.role === 'surveyor' ? '/dashboard' : '/tasks');
      })
      .catch(() => {
        localStorage.removeItem('qw_token');
        router.replace('/auth/login');
      });
  }, [searchParams, router, queryClient]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">登入中，請稍候...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">載入中...</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
