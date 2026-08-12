import { z } from 'zod';
import { JsonObjectSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const PaymentEventSchema = z.object({
  id: UuidSchema,
  payment_intent_id: UuidSchema,
  event_type: z.string().min(1),
  gateway_event_id: z.string().nullable(),
  payload: JsonObjectSchema,
  processed: z.boolean(),
  created_at: TimestamptzSchema,
});

export const CreatePaymentEventSchema = z.object({
  payment_intent_id: UuidSchema,
  event_type: z.string().min(1),
  gateway_event_id: z.string().nullable().optional(),
  payload: JsonObjectSchema.optional(),
  processed: z.boolean().optional(),
});

export const UpdatePaymentEventSchema = z
  .object({
    processed: z.boolean(),
  })
  .partial();
