import { z } from 'zod';
import {
  JsonObjectSchema,
  PaymentGatewaySchema,
  PaymentIntentStatusSchema,
  PositiveNumberSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const PaymentIntentSchema = z.object({
  id: UuidSchema,
  order_id: UuidSchema,
  gateway: PaymentGatewaySchema,
  gateway_id: z.string().nullable(),
  amount: PositiveNumberSchema,
  currency: z.string().min(1),
  status: PaymentIntentStatusSchema,
  gateway_response: JsonObjectSchema.nullable(),
  idempotency_key: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreatePaymentIntentSchema = z.object({
  order_id: UuidSchema,
  gateway: PaymentGatewaySchema.optional(),
  gateway_id: z.string().nullable().optional(),
  amount: PositiveNumberSchema,
  currency: z.string().min(1).optional(),
  status: PaymentIntentStatusSchema.optional(),
  gateway_response: JsonObjectSchema.nullable().optional(),
  idempotency_key: UuidSchema.optional(),
});

export const UpdatePaymentIntentSchema = z
  .object({
    gateway_id: z.string().nullable(),
    status: PaymentIntentStatusSchema,
    gateway_response: JsonObjectSchema.nullable(),
  })
  .partial();
