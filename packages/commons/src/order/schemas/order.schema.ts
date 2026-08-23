import { z } from 'zod';
import {
  OrderStatusSchema,
  PositiveNumberSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const OrderSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  offer_id: UuidSchema,
  business_id: UuidSchema,
  order_number: z.string().min(1),
  status: OrderStatusSchema,
  price: PositiveNumberSchema,
  original_price: PositiveNumberSchema,
  pickup_code: z.string().min(1),
  pickup_time: TimestamptzSchema.nullable(),
  coupon_id: UuidSchema.nullable(),
  /** Tarifa congelada al crear la orden (fracción, ej. 0.1 = 10%). */
  commission_rate: z.number().min(0).max(1),
  platform_fee: z.number().min(0),
  net_amount: z.number().min(0),
  payout_id: UuidSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateOrderSchema = z.object({
  user_id: UuidSchema,
  offer_id: UuidSchema,
  business_id: UuidSchema,
  order_number: z.string().min(1),
  status: OrderStatusSchema.optional(),
  price: PositiveNumberSchema,
  original_price: PositiveNumberSchema,
  pickup_code: z.string().min(1),
  pickup_time: TimestamptzSchema.nullable().optional(),
  coupon_id: UuidSchema.nullable().optional(),
  commission_rate: z.number().min(0).max(1).optional(),
  platform_fee: z.number().min(0).optional(),
  net_amount: z.number().min(0).optional(),
  payout_id: UuidSchema.nullable().optional(),
});

export const UpdateOrderSchema = z
  .object({
    status: OrderStatusSchema,
    pickup_time: TimestamptzSchema.nullable(),
    coupon_id: UuidSchema.nullable(),
    price: PositiveNumberSchema,
  })
  .partial();
