import { z } from 'zod';
import {
  DateSchema,
  PayoutStatusSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const PayoutSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema,
  period_start: DateSchema,
  period_end: DateSchema,
  gross_amount: z.number(),
  platform_fee: z.number(),
  net_amount: z.number(),
  status: PayoutStatusSchema,
  gateway_payout_id: z.string().nullable(),
  paid_at: TimestamptzSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreatePayoutSchema = z.object({
  business_id: UuidSchema,
  period_start: DateSchema,
  period_end: DateSchema,
  gross_amount: z.number(),
  platform_fee: z.number(),
  net_amount: z.number(),
  status: PayoutStatusSchema.optional(),
  gateway_payout_id: z.string().nullable().optional(),
  paid_at: TimestamptzSchema.nullable().optional(),
});

export const UpdatePayoutSchema = z
  .object({
    status: PayoutStatusSchema,
    gateway_payout_id: z.string().nullable(),
    paid_at: TimestamptzSchema.nullable(),
  })
  .partial();
