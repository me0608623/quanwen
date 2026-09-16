import type { ApiErrorBody } from '../types/api';

/**
 * Base URL for NestJS global prefix `api/v1`.
 * Override with EXPO_PUBLIC_API_URL (see .env.example).
 * Android emulator default reaches host loopback via 10.0.2.2.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'http://10.0.2.2:3001/api/v1';
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string | null;
  body?: unknown;
  params?: Record<string, string | undefined>;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, params } = options;
  const base = getApiBaseUrl();
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!res.ok) {
    const errBody = (parsed ?? null) as ApiErrorBody | null;
    const msg = Array.isArray(errBody?.message)
      ? errBody!.message.join(', ')
      : typeof errBody?.message === 'string'
        ? errBody.message
        : `請求失敗 (${res.status})`;
    throw new ApiError(res.status, msg, errBody);
  }

  return parsed as T;
}
