/** Uniform envelope returned by every API endpoint. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code: string;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Arbitrary equality filters, e.g. { status: 'PUBLISHED' } */
  filters?: Record<string, string | number | boolean>;
}

export interface BaseEntity {
  id: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SeoMeta {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  jsonLd?: Record<string, unknown>;
  noIndex?: boolean;
}
