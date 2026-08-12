import { z } from 'zod';
import { JsonObjectSchema, PlatformSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const DeviceTokenSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  token: z.string().min(1),
  platform: PlatformSchema,
  device_info: JsonObjectSchema.nullable(),
  is_active: z.boolean(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateDeviceTokenSchema = z.object({
  user_id: UuidSchema,
  token: z.string().min(1),
  platform: PlatformSchema,
  device_info: JsonObjectSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});

export const UpdateDeviceTokenSchema = z
  .object({
    token: z.string().min(1),
    platform: PlatformSchema,
    device_info: JsonObjectSchema.nullable(),
    is_active: z.boolean(),
  })
  .partial();
