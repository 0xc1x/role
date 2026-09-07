import { z } from 'zod';

// ─── Query helpers ──────────────────────────────────────────────────────────

/** Coerces `true`/`false`/`1`/`0` query strings into boolean | undefined */
export const BooleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v): boolean | undefined => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ─── Generic API response wrappers ──────────────────────────────────────────

/**
 * Pagination metadata returned by list endpoints.
 * Field names match list query params (`page`, `limit`) for client simplicity.
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});

/**
 * Canonical paginated list body used by Role API list endpoints:
 * `{ data: T[], meta: PaginationMeta }`
 */
export const PaginatedDataSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    meta: PaginationMetaSchema,
  });
