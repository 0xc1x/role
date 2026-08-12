import { z } from 'zod';
import { AddressTypeSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const SavedAddressSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  label: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  is_default: z.boolean(),
  type: AddressTypeSchema,
  references: z.string().nullable(),
  housing_type: z.string().nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateSavedAddressSchema = z.object({
  user_id: UuidSchema,
  label: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  is_default: z.boolean().optional(),
  type: AddressTypeSchema.optional(),
  references: z.string().nullable().optional(),
  housing_type: z.string().nullable().optional(),
});

export const UpdateSavedAddressSchema = CreateSavedAddressSchema.partial().omit({
  user_id: true,
});
