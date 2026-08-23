import { z } from 'zod';
import {
  PaginatedDataSchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import {
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

/**
 * Base: projection of a business for commission management.
 * `commission_rate` is a fraction (0.1 = 10%), matching businesses.commission_rate.
 */
const CommissionBaseSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(120),
  commission_rate: z.number().min(0, 'La comisión no puede ser negativa').max(1, 'La comisión no puede superar el 100%'),
  active: z.boolean(),
  has_pending_payouts: z.boolean(),
});

/** Commission resource as returned by the API. */
export const CommissionSchema = CommissionBaseSchema.extend({
  id: UuidSchema,
  updated_at: TimestamptzSchema.nullable(),
});

/** Update payload — the only editable field. */
export const UpdateCommissionSchema = z.object({
  commission_rate: z
    .number()
    .min(0, 'La comisión no puede ser negativa')
    .max(1, 'La comisión no puede superar el 100%'),
});

export const ListCommissionsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
});

/** Canonical list response: `{ data: Commission[], meta: PaginationMeta }`. */
export const CommissionListResponseSchema = PaginatedDataSchema(CommissionSchema);
