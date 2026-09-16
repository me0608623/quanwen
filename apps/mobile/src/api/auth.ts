import { apiRequest } from './client';
import type { AuthResponse, AuthUser } from '../types/api';

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function register(dto: {
  email: string;
  password: string;
  displayName: string;
  role: 'surveyor' | 'respondent';
}) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: dto,
  });
}

export function getMe(token: string) {
  return apiRequest<AuthUser>('/auth/me', { token });
}
