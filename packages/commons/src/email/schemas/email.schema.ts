import { z } from 'zod';
import { BooleanQuerySchema, PaginatedDataSchema, PaginationQuerySchema } from '../../_common/schemas/api.schema';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';
import {
  CAMPAIGN_STATUSES,
  EMAIL_COMPONENT_TYPES,
  EMAIL_SEND_STATUSES,
  MARKETING_CATEGORIES,
  SEGMENT_TYPES,
} from '../enums/email.enum';

// ─── Componentes (header / footer) ─────────────────────────────────────

export const EmailComponentSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(EMAIL_COMPONENT_TYPES),
  html_content: z.string().min(1),
  is_active: z.boolean(),
});

export const EmailComponentDtoSchema = EmailComponentSchema.extend({
  id: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
  deleted_at: TimestamptzSchema.nullable(),
});

export const CreateEmailComponentSchema = EmailComponentSchema.partial({
  is_active: true,
});
export const UpdateEmailComponentSchema = EmailComponentSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

// ─── Plantillas ────────────────────────────────────────────────────────

/** Variables disponibles declaradas por el editor: ["nombre", "empresa", …]. */
export const TemplateVariablesSchema = z.array(z.string().min(1).max(60));

export const EmailTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body_html: z.string().min(1),
  header_id: UuidSchema.nullable(),
  footer_id: UuidSchema.nullable(),
  variables: TemplateVariablesSchema,
  is_active: z.boolean(),
});

export const EmailTemplateDtoSchema = EmailTemplateSchema.extend({
  id: UuidSchema,
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
  deleted_at: TimestamptzSchema.nullable(),
});

export const CreateEmailTemplateSchema = EmailTemplateSchema.partial({
  header_id: true,
  footer_id: true,
  variables: true,
  is_active: true,
});
export const UpdateEmailTemplateSchema = EmailTemplateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

/** Preview renderizado (header + body + footer ensamblados). */
export const RenderedEmailSchema = z.object({
  subject: z.string(),
  html: z.string(),
  variables_used: TemplateVariablesSchema,
});
export type RenderedEmail = z.infer<typeof RenderedEmailSchema>;

// ─── Segmentos dinámicos: whitelist de filtros ─────────────────────────

/**
 * DSL mínimo y validado: nada de queries arbitrarias desde JSONB.
 * `field` solo acepta columnas permitidas; `op` operadores fijos.
 */
export const SEGMENT_FILTER_FIELDS = [
  'role',
  'city',
  'created_at',
] as const;
export const SEGMENT_FILTER_OPS = ['eq', 'neq', 'gte', 'lte', 'contains'] as const;

const SegmentFilterSchema = z.object({
  field: z.enum(SEGMENT_FILTER_FIELDS),
  op: z.enum(SEGMENT_FILTER_OPS),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const SegmentFiltersSchema = z.object({
  and: z.array(SegmentFilterSchema).max(10),
});

export const SegmentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  type: z.enum(SEGMENT_TYPES),
  filters: SegmentFiltersSchema.nullable(),
  /** Solo combina con campañas de la misma categoría. */
  category: z.enum(MARKETING_CATEGORIES),
  is_active: z.boolean(),
});

export const SegmentDtoSchema = SegmentSchema.extend({
  id: UuidSchema,
  estimated_count: z.number().int().nonnegative().nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
  deleted_at: TimestamptzSchema.nullable(),
});

export const CreateSegmentSchema = SegmentSchema.partial({
  description: true,
  type: true,
  filters: true,
})
  .extend({
    // Categoría por defecto si el form no la envía.
    category: z.enum(MARKETING_CATEGORIES).default('announcements'),
    // Miembros iniciales del segmento estático (clave desconocida para el
    // schema = eliminada por Zod antes de llegar al controller).
    user_ids: z.array(UuidSchema).max(500).optional(),
  })
  .superRefine((v, ctx) => {
  if (v.type === 'dynamic' && !v.filters) {
    ctx.addIssue({
      code: 'custom',
      path: ['filters'],
      message: 'Los segmentos dinámicos requieren filtros',
    });
  }
});

export const UpdateSegmentSchema = SegmentSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Se requiere al menos un campo para actualizar' },
);

export const AddSegmentUsersSchema = z.object({
  user_ids: z.array(UuidSchema).min(1).max(500),
});

// ─── Campañas ──────────────────────────────────────────────────────────

export const CampaignSchema = z.object({
  name: z.string().min(1).max(120),
  template_id: UuidSchema.nullable(),
  subject_override: z.string().max(200).nullable(),
  body_override: z.string().nullable(),
  category: z.enum(MARKETING_CATEGORIES),
  segment_ids: z.array(UuidSchema),
  include_user_ids: z.array(UuidSchema),
  exclude_user_ids: z.array(UuidSchema),
  scheduled_at: TimestamptzSchema.nullable(),
});

export const CampaignDtoSchema = CampaignSchema.extend({
  id: UuidSchema,
  status: z.enum(CAMPAIGN_STATUSES),
  deleted_at: TimestamptzSchema.nullable(),
  sent_at: TimestamptzSchema.nullable(),
  total_recipients: z.number().int().nonnegative(),
  total_sent: z.number().int().nonnegative(),
  total_delivered: z.number().int().nonnegative(),
  total_opened: z.number().int().nonnegative(),
  total_clicked: z.number().int().nonnegative(),
  total_bounced: z.number().int().nonnegative(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateCampaignSchema = CampaignSchema.partial({
  subject_override: true,
  body_override: true,
  category: true,
  segment_ids: true,
  include_user_ids: true,
  exclude_user_ids: true,
  scheduled_at: true,
});

export const UpdateCampaignSchema = CampaignSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Se requiere al menos un campo para actualizar' },
);

/** Envío de prueba: emails fijos, mismo pipeline de render. */
export const TestCampaignSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(10),
  overrides: z
    .object({
      subject: z.string().max(200).optional(),
      body_html: z.string().optional(),
    })
    .optional(),
});

// ─── Envíos individuales ───────────────────────────────────────────────

export const EmailSendDtoSchema = z.object({
  id: UuidSchema,
  campaign_id: UuidSchema,
  user_id: UuidSchema.nullable(),
  email: z.string().email(),
  resend_id: z.string().nullable(),
  status: z.enum(EMAIL_SEND_STATUSES),
  sent_at: TimestamptzSchema.nullable(),
  delivered_at: TimestamptzSchema.nullable(),
  opened_at: TimestamptzSchema.nullable(),
  clicked_at: TimestamptzSchema.nullable(),
  bounced_at: TimestamptzSchema.nullable(),
  error_message: z.string().nullable(),
  created_at: TimestamptzSchema,
});

export const ListSendsQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(EMAIL_SEND_STATUSES).optional(),
});

export const EmailSendListResponseSchema = PaginatedDataSchema(EmailSendDtoSchema);

// ─── Listas paginadas ──────────────────────────────────────────────────

export const ListComponentsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  active: BooleanQuerySchema,
});

export const ListTemplatesQuerySchema = ListComponentsQuerySchema;
export const ListSegmentsQuerySchema = ListComponentsQuerySchema.extend({
  category: z.enum(MARKETING_CATEGORIES).optional(),
});
export const ListCampaignsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).max(100).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

/** Respuestas de lista canónicas `{ data, meta }`. */
export const EmailComponentListResponseSchema = PaginatedDataSchema(EmailComponentDtoSchema);
export const EmailTemplateListResponseSchema = PaginatedDataSchema(EmailTemplateDtoSchema);
export const SegmentListResponseSchema = PaginatedDataSchema(SegmentDtoSchema);
export const CampaignListResponseSchema = PaginatedDataSchema(CampaignDtoSchema);
