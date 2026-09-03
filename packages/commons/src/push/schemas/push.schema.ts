import { z } from 'zod';
import { BooleanQuerySchema, PaginatedDataSchema, PaginationQuerySchema } from '../../_common/schemas/api.schema';
import { JsonObjectSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';
import { PLATFORMS } from '../../_common/enums/platform';
import { PUSH_NOTIFICATION_TYPES, PUSH_SEND_STATUSES } from '../enums/push.enum';

// ─── Plantillas de push ────────────────────────────────────────────────

export const PushTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  /** data extra enviada con la notificación (link, imagen, tag…). */
  data: JsonObjectSchema,
  is_active: z.boolean(),
});

export const PushTemplateDtoSchema = PushTemplateSchema.extend({
  id: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
  deleted_at: TimestamptzSchema.nullable(),
});

export const CreatePushTemplateSchema = PushTemplateSchema.partial({
  data: true,
  is_active: true,
});
export const UpdatePushTemplateSchema = PushTemplateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

// ─── Envío manual ──────────────────────────────────────────────────────

/** Payload de una notificación push (título, cuerpo y data plana). */
export const PushPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  type: z.enum(PUSH_NOTIFICATION_TYPES).default('announcement'),
  data: JsonObjectSchema.optional(),
});

/** Audiencia: segmentos ∪ include − exclude (mínimo uno de los tres). */
export const PushAudienceSchema = z.object({
  segment_ids: z.array(UuidSchema).max(20).default([]),
  include_user_ids: z.array(UuidSchema).max(500).default([]),
  exclude_user_ids: z.array(UuidSchema).max(500).default([]),
});

export const CreatePushSendSchema = PushPayloadSchema.extend(PushAudienceSchema.shape).refine(
  (v) => v.segment_ids.length > 0 || v.include_user_ids.length > 0,
  { message: 'Define al menos un segmento o usuario destinatario' },
);

/** Envío de prueba: usuarios fijos, sin filtros de preferencias ni historial. */
export const PushTestSchema = z.object({
  user_ids: z.array(UuidSchema).min(1).max(10),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  type: z.enum(PUSH_NOTIFICATION_TYPES).default('announcement'),
});

export const PushSendResultSchema = z.object({
  id: UuidSchema.nullable(),
  targeted: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type PushSendResult = z.infer<typeof PushSendResultSchema>;

// ─── Historial ─────────────────────────────────────────────────────────

export const PushNotificationDtoSchema = z.object({
  id: UuidSchema,
  template_id: UuidSchema.nullable(),
  title: z.string(),
  body: z.string(),
  type: z.enum(PUSH_NOTIFICATION_TYPES),
  data: JsonObjectSchema,
  segment_ids: z.array(UuidSchema),
  include_user_ids: z.array(UuidSchema),
  exclude_user_ids: z.array(UuidSchema),
  total_targeted: z.number().int().nonnegative(),
  sent_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  status: z.enum(PUSH_SEND_STATUSES),
  created_by: UuidSchema.nullable(),
  created_at: TimestamptzSchema,
});

export const ListPushNotificationsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  type: z.enum(PUSH_NOTIFICATION_TYPES).optional(),
});

export const PushNotificationListResponseSchema = PaginatedDataSchema(PushNotificationDtoSchema);

// ─── Dispositivos (device_tokens) ──────────────────────────────────────

export const PushTokenDtoSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  user_email: z.string().nullable(),
  user_full_name: z.string().nullable(),
  token: z.string(),
  platform: z.enum(PLATFORMS),
  is_active: z.boolean(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const UpdatePushTokenSchema = z.object({
  is_active: z.boolean(),
});

export const ListPushTokensQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  platform: z.enum(PLATFORMS).optional(),
  active: BooleanQuerySchema,
});

export const PushTokenListResponseSchema = PaginatedDataSchema(PushTokenDtoSchema);

// ─── Listas de plantillas ──────────────────────────────────────────────

export const ListPushTemplatesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  active: BooleanQuerySchema,
});

export const PushTemplateListResponseSchema = PaginatedDataSchema(PushTemplateDtoSchema);
