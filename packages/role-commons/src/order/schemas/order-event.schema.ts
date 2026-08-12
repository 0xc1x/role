import { z } from 'zod';
import {
  JsonObjectSchema,
  OrderStatusSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const OrderEventSchema = z.object({
  id: UuidSchema,
  order_id: UuidSchema,
  status: OrderStatusSchema,
  previous_status: OrderStatusSchema.nullable(),
  changed_by: UuidSchema.nullable(),
  reason: z.string().nullable(),
  metadata: JsonObjectSchema.nullable(),
  created_at: TimestamptzSchema,
});

export const CreateOrderEventSchema = z.object({
  order_id: UuidSchema,
  status: OrderStatusSchema,
  previous_status: OrderStatusSchema.nullable().optional(),
  changed_by: UuidSchema.nullable().optional(),
  reason: z.string().nullable().optional(),
  metadata: JsonObjectSchema.nullable().optional(),
});
