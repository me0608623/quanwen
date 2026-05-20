'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { setToken, removeToken } from '@/lib/token';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'surveyor' | 'respondent' | 'admin';
  status: 'active' | 'suspended' | 'pending_verify';
  emailVerified: boolean;
}

/** Returns true when the user signed up via LINE/Apple and hasn't set a real email yet */
export function isPlaceholderEmail(email: string | undefined): boolean {
  return !!email && (email.endsWith('@line.placeholder') || email.endsWith('@apple.placeholder'));
}

export interface LinkedProvider {
  provider: 'google' | 'line' | 'apple';
  providerEmail: string | null;
  providerAvatarUrl: string | null;
  linkedAt: string;
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
      setToken(token);
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
      setToken(token);
      queryClient.setQueryData(['auth', 'me'], user);
      router.push(user.role === 'surveyor' ? '/onboarding/surveyor' : '/onboarding');
    },
  });
}

export function useSelectRole() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (dto: { role: 'surveyor' | 'respondent'; displayName?: string }) => {
      const { data } = await api.post<{ user: AuthUser; token: string }>('/auth/select-role', dto);
      return data;
    },
    onSuccess: ({ user, token }) => {
      setToken(token);
      queryClient.setQueryData(['auth', 'me'], user);
      // Clear any stale profile data — role just changed so old profile cache is invalid
      queryClient.removeQueries({ queryKey: ['profile'] });
      router.push(user.role === 'surveyor' ? '/onboarding/surveyor' : '/onboarding');
    },
  });
}

export interface SecurityInfo {
  hasPassword: boolean;
  linkedProviders: LinkedProvider[];
}

export function useSecurityInfo() {
  return useQuery<SecurityInfo>({
    queryKey: ['auth', 'security'],
    queryFn: async () => {
      const { data } = await api.get<SecurityInfo>('/auth/security');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useChangeEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await api.post<{ user: AuthUser; token: string; message: string }>(
        '/auth/security/change-email',
        { email },
      );
      return data;
    },
    onSuccess: ({ user, token }) => {
      if (token) {
        setToken(token);
        queryClient.setQueryData(['auth', 'me'], user);
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'security'] });
    },
  });
}

export function useSetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) => {
      const { data } = await api.post<{ message: string }>('/auth/security/set-password', { password });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'security'] });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { currentPassword: string; newPassword: string }) => {
      const { data } = await api.post<{ message: string }>('/auth/security/change-password', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'security'] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: { displayName: string }) => {
      const { data } = await api.post('/auth/profile', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useLinkedProviders() {
  return useQuery<LinkedProvider[]>({
    queryKey: ['auth', 'linked-providers'],
    queryFn: async () => {
      const { data } = await api.get<LinkedProvider[]>('/auth/linked-providers');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useUnbindProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      const { data } = await api.delete(`/auth/linked-providers/${provider}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'linked-providers'] });
    },
  });
}

export function useSendVerificationEmail() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ message: string }>('/auth/send-verification-email');
      return data;
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data } = await api.post<{ message: string }>('/auth/verify-email', { token });
      return data;
    },
    onSuccess: () => {
      // Refresh user data so emailVerified reflects the new state
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email });
      return data;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (dto: { token: string; password: string }) => {
      const { data } = await api.post<{ message: string }>('/auth/reset-password', dto);
      return data;
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    removeToken();
    queryClient.clear(); // wipes all cached queries including profile, surveys, wallet
    router.push('/auth/login');
  };
}
