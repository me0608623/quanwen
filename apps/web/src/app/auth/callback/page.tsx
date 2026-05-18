'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthUser } from '@/hooks/use-auth';

export default function AuthCallbackPage() {
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

    // 拿 user info 後決定跳轉
    api.get<AuthUser>('/auth/me').then(({ data }) => {
      queryClient.setQueryData(['auth', 'me'], data);
      router.replace(data.role === 'surveyor' ? '/dashboard' : '/tasks');
    }).catch(() => {
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
