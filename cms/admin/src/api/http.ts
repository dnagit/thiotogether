import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiResponse } from '@cms/shared';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true, // refresh token cookie
  timeout: 30_000,
});

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// ── 401 → single-flight refresh → retry ─────────────────────
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
    `${http.defaults.baseURL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return data.data.accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<any>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
        const token = await refreshing;
        setAccessToken(token);
        const { useAuthStore } = await import('@/stores/auth');
        useAuthStore().accessToken = token;
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      } catch {
        const { useAuthStore } = await import('@/stores/auth');
        useAuthStore().forceLogout();
        return Promise.reject(error);
      }
    }

    // Surface API error messages globally (except validation, handled by forms).
    const payload = error.response?.data;
    if (payload?.message && payload.code !== 'VALIDATION_ERROR') {
      ElMessage.error(payload.message);
    }
    return Promise.reject(error);
  },
);
