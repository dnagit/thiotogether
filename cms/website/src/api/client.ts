import axios from 'axios';
import type { ApiResponse } from '@cms/shared';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  timeout: 20_000,
});

/** GET a public endpoint and unwrap the ApiResponse envelope. */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(`/public${url}`, { params });
  return data.data;
}

export async function post<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
  const { data } = await api.post<ApiResponse<T>>(`/public${url}`, body);
  return data;
}
