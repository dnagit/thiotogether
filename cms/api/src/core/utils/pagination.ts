import type { ListQuery, PaginationMeta } from '@cms/shared';
import type { Request } from 'express';

export interface ParsedListQuery extends Required<Pick<ListQuery, 'page' | 'limit'>> {
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  filters: Record<string, string>;
  skip: number;
  take: number;
}

const RESERVED = new Set(['page', 'limit', 'search', 'sortBy', 'sortOrder']);
const MAX_LIMIT = 100;

/** Parse ?page=&limit=&search=&sortBy=&sortOrder=&<anyFilter>= from a request. */
export function parseListQuery(req: Request): ParsedListQuery {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 20));
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(q)) {
    if (!RESERVED.has(key) && typeof value === 'string' && value !== '') filters[key] = value;
  }
  return {
    page,
    limit,
    search: q.search || undefined,
    sortBy: q.sortBy || undefined,
    sortOrder: q.sortOrder === 'asc' ? 'asc' : 'desc',
    filters,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
