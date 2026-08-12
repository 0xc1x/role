import { z } from 'zod';
import {
  CouponTypeSchema,
  PositiveNumberSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const CouponSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema,
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

export const CreateCouponSchema = z.object({
  business_id: UuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  type: CouponTypeSchema,
  value: PositiveNumberSchema,
  min_order_amount: z.number().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  expires_at: TimestamptzSchema.nullable().optional(),
});

export const UpdateCouponSchema = CreateCouponSchema.partial().omit({
  business_id: true,
});
