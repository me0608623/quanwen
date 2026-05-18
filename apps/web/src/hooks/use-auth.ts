'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'surveyor' | 'respondent' | 'admin';
}

export function useMe() {
  return useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get<AuthUser>('/auth/me');
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (dto: { email: string; password: string }) => {
      const { data } = await api.post<{ user: AuthUser; token: string }>('/auth/login', dto);
      return data;
    },
    onSuccess: ({ user, token }) => {
      localStorage.setItem('qw_token', token);
      queryClient.setQueryData(['auth', 'me'], user);
      router.push(user.role === 'surveyor' ? '/dashboard' : '/tasks');
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (dto: {
      email: string;
      password: string;
      displayName: string;
      role: 'surveyor' | 'respondent';
    }) => {
      const { data } = await api.post<{ user: AuthUser; token: string }>('/auth/register', dto);
      return data;
    },
    onSuccess: ({ user, token }) => {
      localStorage.setItem('qw_token', token);
      queryClient.setQueryData(['auth', 'me'], user);
      router.push(user.role === 'surveyor' ? '/dashboard' : '/tasks');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    localStorage.removeItem('qw_token');
    queryClient.clear();
    router.push('/auth/login');
  };
}
