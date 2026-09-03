import { z } from 'zod';
import {
  CouponTypeSchema,
  PositiveNumberSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';
import {
  BooleanQuerySchema,
  PaginatedDataSchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';

/**
 * `business_id` nullable: `null` = cupón global de plataforma (creado en admin),
 * aplicable a ofertas de cualquier negocio. Los cupones de negocio los gestiona
 * cada negocio desde móvil.
 */
export const CouponSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema.nullable(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: CouponTypeSchema,
  value: PositiveNumberSchema,
  min_order_amount: z.number().nullable(),
  max_uses: z.number().int().positive().nullable(),
  used_count: z.number().int().nonnegative(),
  is_active: z.boolean(),
  expires_at: TimestamptzSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

/** Base sin refinement (safe para .omit()/.pick() en forms). */
export const CreateCouponBaseSchema = z.object({
  business_id: UuidSchema.nullable().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: CouponTypeSchema,
  value: PositiveNumberSchema,
  min_order_amount: z.number().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  expires_at: TimestamptzSchema.nullable().optional(),
});

export const CreateCouponSchema = CreateCouponBaseSchema.refine(
  (body) => body.type !== 'percentage' || body.value <= 100,
  { message: 'El porcentaje no puede superar 100', path: ['value'] },
);

export const UpdateCouponSchema = CreateCouponBaseSchema
  .partial()
  .omit({ business_id: true })
  .refine(
    (body) => body.type !== 'percentage' || body.value === undefined || body.value <= 100,
    { message: 'El porcentaje no puede superar 100', path: ['value'] },
  );

export const ListCouponsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  is_active: BooleanQuerySchema,
  /** `true` → solo cupones globales; `false` → solo de negocio; ausente → todos. */
  global: BooleanQuerySchema,
});

/** Item enriquecido del listado (nombre del negocio asociado, si aplica). */
export const CouponListItemSchema = CouponSchema.extend({
  business_name: z.string().nullable(),
});

/** Canonical list response: `{ data: Coupon[], meta: PaginationMeta }`. */
export const CouponListResponseSchema = PaginatedDataSchema(CouponListItemSchema);
