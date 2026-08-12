import { z } from 'zod';
import { TimeSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const ConsumerNotificationPreferencesSchema = z.object({
  user_id: UuidSchema,
  push_enabled: z.boolean(),
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  whatsapp_enabled: z.boolean(),
  favorite_alerts_enabled: z.boolean(),
  pickup_reminders_enabled: z.boolean(),
  last_minute_deals_enabled: z.boolean(),
  weekly_summary_enabled: z.boolean(),
  quiet_hours_from: TimeSchema.nullable(),
  quiet_hours_to: TimeSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateConsumerNotificationPreferencesSchema = z.object({
  user_id: UuidSchema,
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
  favorite_alerts_enabled: z.boolean().optional(),
  pickup_reminders_enabled: z.boolean().optional(),
  last_minute_deals_enabled: z.boolean().optional(),
  weekly_summary_enabled: z.boolean().optional(),
  quiet_hours_from: TimeSchema.nullable().optional(),
  quiet_hours_to: TimeSchema.nullable().optional(),
});

export const UpdateConsumerNotificationPreferencesSchema =
  CreateConsumerNotificationPreferencesSchema.partial().omit({ user_id: true });
