import { z } from 'zod';
import { ORDER_STATUSES } from '../enums/order-status';
import { UuidSchema } from '../../_common/schemas/common';

export const CreateOrderRequestSchema = z.object({
  offer_id: UuidSchema,
  coupon_code: z.string().min(1).optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().min(1).max(500).optional(),
});

/** Body para validar código de recogida (espejo de la RPC validate_pickup_code). */
export const ValidatePickupCodeSchema = z.object({
  pickup_code: z.string().min(1),
});

export const ListOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** Business portal: list orders for one of the caller's businesses. */
export const ListBusinessOrdersQuerySchema = z.object({
  business_id: UuidSchema.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
