import { z } from 'zod';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const BusinessLocationSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema,
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  is_active: z.boolean(),
  zone: z.string().nullable(),
  is_headquarter: z.boolean(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateBusinessLocationSchema = z.object({
  business_id: UuidSchema,
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  is_active: z.boolean().optional(),
  zone: z.string().nullable().optional(),
  is_headquarter: z.boolean().optional(),
});

export const UpdateBusinessLocationSchema =
  CreateBusinessLocationSchema.partial().omit({ business_id: true });
