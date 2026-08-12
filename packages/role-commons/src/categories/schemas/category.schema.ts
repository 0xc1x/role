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

const SlugSchema = z
  .string()
  .min(1, "El slug no puede estar vacío")
  .max(120, "El slug no debe superar los 120 caracteres")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug debe estar en minúsculas y formato kebab-case',
  });

/** 
 * 1. ESQUEMA BASE: Centraliza todas las reglas y mensajes de error.
 * Ningún esquema repite validaciones, todos heredan de aquí.
 */
const CategoryBaseSchema = z.object({
  name: z.string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre no debe superar los 100 caracteres"),
  description: z.string()
    .min(1, "La descripción no puede estar vacía")
    .max(500, "La descripción no debe superar los 500 caracteres")
    .nullable(),
  emoji: z.string()
    .max(16, "El emoji no debe superar los 16 caracteres")
    .nullable(),
  slug: SlugSchema,
  image_url: z.string()
    .min(1, "La URL de la imagen no puede estar vacía")
    .nullable(),
  active: z.boolean(),
});

/** Full category resource as returned by the API (ISO timestamps as strings). */
export const CategorySchema = CategoryBaseSchema.extend({
  id: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema.nullable(),
  deleted_at: TimestamptzSchema.nullable(),
});

/** Public-facing subset (no audit / soft-delete fields). */
export const ViewCategorySchema = CategoryBaseSchema.extend({
  id: UuidSchema,
});

/** Create payload */
export const CreateCategorySchema = CategoryBaseSchema.extend({
  // Sobrescribimos 'active' para que sea opcional por defecto en la creación
  active: z.boolean().optional().default(true),
}).partial({
  // Hacemos opcionales los campos que no son estrictamente obligatorios al crear
  description: true,
  emoji: true,
  slug: true,
  image_url: true,
});

/** Update payload */
export const UpdateCategorySchema = CategoryBaseSchema
  .partial() // En un UPDATE, todos los campos son opcionales
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

/** Alias — PATCH uses the same partial contract as update. */
export const PatchCategorySchema = UpdateCategorySchema;

export const ListCategoriesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  active: BooleanQuerySchema,
});

/** Canonical list response: `{ data: Category[], meta: PaginationMeta }`. */
export const CategoryListResponseSchema = PaginatedDataSchema(CategorySchema);