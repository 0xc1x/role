import type { z } from 'zod';
import type { PaginationMetaSchema } from '../schemas/api.schema';

/** Pagination metadata for list endpoints (aligned with `page` / `limit` query). */
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * Canonical paginated list body for Role API:
 * `{ data: T[], meta: PaginationMeta }`
 */
export type PaginatedData<T> = {
  data: T[];
  meta: PaginationMeta;
};

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
