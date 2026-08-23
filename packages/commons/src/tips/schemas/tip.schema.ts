import { z } from 'zod';
import {
  BooleanQuerySchema,
  PaginatedDataSchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import {
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

/**
 * 1. ESQUEMA BASE: Centraliza todas las reglas y mensajes de error.
 */
const TipBaseSchema = z.object({
  content: z.string()
    .min(3, "El consejo debe tener al menos 3 caracteres")
    .max(300, "El consejo no debe superar los 300 caracteres"),
  active: z.boolean(),
});

/** Full tip resource as returned by the API (ISO timestamps as strings). */
export const TipSchema = TipBaseSchema.extend({
  id: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema.nullable(),
  deleted_at: TimestamptzSchema.nullable(),
});

/** Public-facing subset (no audit / soft-delete fields). */
export const ViewTipSchema = TipBaseSchema.extend({
  id: UuidSchema,
});

/** Create payload */
export const CreateTipSchema = TipBaseSchema.extend({
  active: z.boolean().optional().default(true),
});

/** Update payload */
export const UpdateTipSchema = TipBaseSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

/** Alias — PATCH uses the same partial contract as update. */
export const PatchTipSchema = UpdateTipSchema;

export const ListTipsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  active: BooleanQuerySchema,
});

/** Canonical list response: `{ data: Tip[], meta: PaginationMeta }`. */
export const TipListResponseSchema = PaginatedDataSchema(TipSchema);
