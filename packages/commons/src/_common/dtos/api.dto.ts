import type { z } from 'zod';
import type {
  ApiErrorSchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
} from '../schemas/api.schema';

// ─── Generic API types ──────────────────────────────────────────────────────

/** Pagination metadata for list endpoints (aligned with `page` / `limit` query). */
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/** Shared page/limit query fragment. */
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Optional full envelope for a single resource.
 * Prefer returning `T` directly from Nest controllers; HTTP status already
 * conveys success/failure. Keep this for clients that expect an envelope.
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error: ApiError | null;
};

/**
 * Alternate paginated envelope (`success` + `pagination`).
 * Prefer {@link PaginatedData} for Nest HTTP list endpoints.
 */
export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  pagination: PaginationMeta;
};

/**
 * Canonical paginated list body for Role API:
 * `{ data: T[], meta: PaginationMeta }`
 */
export type PaginatedData<T> = {
  data: T[];
  meta: PaginationMeta;
};

/** @deprecated Use {@link PaginationMeta} — same shape. */
export type PaginatedMeta = PaginationMeta;

// ─── Response builders (type-safe factories) ────────────────────────────────

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function paginatedData<T>(
  data: readonly T[],
  meta: PaginationMeta,
): PaginatedData<T> {
  return { data: [...data], meta };
}

export function paginatedDataFromQuery<T>(
  data: readonly T[],
  query: Pick<PaginationMeta, 'page' | 'limit'>,
  total: number,
): PaginatedData<T> {
  return paginatedData(data, buildPaginationMeta(query.page, query.limit, total));
}

export function apiOk<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function apiFail(error: ApiError): ApiResponse<null> {
  return { success: false, data: null, error };
}
