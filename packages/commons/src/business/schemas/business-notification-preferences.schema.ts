import { z } from 'zod';
import { TimeSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const BusinessNotificationPreferencesSchema = z.object({
  business_id: UuidSchema,
  push_enabled: z.boolean(),
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  whatsapp_enabled: z.boolean(),
  new_orders_enabled: z.boolean(),
  pickup_ready_enabled: z.boolean(),
  reviews_enabled: z.boolean(),
  low_stock_enabled: z.boolean(),
  daily_summary_enabled: z.boolean(),
  quiet_hours_from: TimeSchema.nullable(),
  quiet_hours_to: TimeSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateBusinessNotificationPreferencesSchema = z.object({
  business_id: UuidSchema,
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
  new_orders_enabled: z.boolean().optional(),
  pickup_ready_enabled: z.boolean().optional(),
  reviews_enabled: z.boolean().optional(),
  low_stock_enabled: z.boolean().optional(),
  daily_summary_enabled: z.boolean().optional(),
  quiet_hours_from: TimeSchema.nullable().optional(),
  quiet_hours_to: TimeSchema.nullable().optional(),
});

export const UpdateBusinessNotificationPreferencesSchema =
  CreateBusinessNotificationPreferencesSchema.partial().omit({
    business_id: true,
  });
