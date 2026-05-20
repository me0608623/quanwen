import axios from 'axios';
import { getToken, removeToken } from './token';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
});

// 自動附 JWT
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 統一處理 401 → 登出
// 只有「本來有 token 但後端拒絕」才視為 session expired 並跳回登入。
// 無 token 的 401（訪客訪問公開頁面觸發的 useMe）直接 reject，不跳轉。
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/auth/')
    ) {
      const hadToken = !!getToken();
      removeToken();
      if (hadToken) {
        sessionStorage.setItem('session_expired', '1');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(err as Error);
  },
);
