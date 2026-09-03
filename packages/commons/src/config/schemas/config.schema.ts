import { z } from 'zod';
import {
  BooleanQuerySchema,
  PaginatedDataSchema,
  PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import { TimestamptzSchema } from '../../_common/schemas/common';
import { APP_CONFIG_CATEGORIES, APP_CONFIG_VALUE_TYPES } from '../enums/config.enum';

/** Dot-separated key: `support.email`, `fees.vat_percent`, … */
export const AppConfigKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(\.[a-z0-9_]+)*$/, {
    message:
      'La clave debe estar en snake_case separada por puntos (ej. fees.vat_percent)',
  });

/**
 * Value is stored as JSONB: number → number, boolean → boolean,
 * everything else → string. Validated per `value_type` at runtime.
 */
export const AppConfigValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.record(z.string(), z.unknown()),
]);

const AppConfigBaseSchema = z.object({
  key: AppConfigKeySchema,
  value: AppConfigValueSchema,
  value_type: z.enum(APP_CONFIG_VALUE_TYPES),
  category: z.enum(APP_CONFIG_CATEGORIES),
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  is_public: z.boolean(),
  active: z.boolean(),
});

/** Full resource as returned by the API (admin grid). */
export const AppConfigSchema = AppConfigBaseSchema.extend({
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

/** Public-facing subset consumed by mobile / landing (no audit fields). */
export const PublicAppConfigSchema = AppConfigBaseSchema.pick({
  key: true,
  value: true,
  value_type: true,
});

/** Create payload — defaults mirror the DB column defaults. */
export const CreateAppConfigSchema = z.object({
  key: AppConfigKeySchema,
  value: AppConfigValueSchema,
  value_type: z.enum(APP_CONFIG_VALUE_TYPES).default('string'),
  category: z.enum(APP_CONFIG_CATEGORIES).default('general'),
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullable().default(null),
  is_public: z.boolean().default(true),
  active: z.boolean().default(true),
});

/** Update payload — `key` es inmutable; todo lo demás es parcial. */
export const UpdateAppConfigSchema = z
  .object({
    value: AppConfigValueSchema.optional(),
    value_type: z.enum(APP_CONFIG_VALUE_TYPES).optional(),
    category: z.enum(APP_CONFIG_CATEGORIES).optional(),
    label: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    is_public: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

/** Aliases sin refinements extra — safe para .omit()/.pick() en forms. */
export const CreateAppConfigFormSchema = CreateAppConfigSchema;
export const UpdateAppConfigFormSchema = UpdateAppConfigSchema;

/** Query params for the list endpoint. */
export const ListAppConfigQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  category: z.enum(APP_CONFIG_CATEGORIES).optional(),
  active: BooleanQuerySchema,
});

/** Canonical list response: `{ data: AppConfig[], meta }`. */
export const AppConfigListResponseSchema = PaginatedDataSchema(AppConfigSchema);
