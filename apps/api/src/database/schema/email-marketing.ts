import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

// ─── Enums ──────────────────────────────────────────────────────────────
export const emailComponentTypeEnum = pgEnum('email_component_type', [
  'header',
  'footer',
]);
export const segmentTypeEnum = pgEnum('segment_type', ['static', 'dynamic']);
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
]);
export const emailSendStatusEnum = pgEnum('email_send_status', [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
]);

// ─── Componentes (header / footer) ─────────────────────────────────────
export const emailComponents = pgTable(
  'email_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: emailComponentTypeEnum('type').notNull(),
    html_content: text('html_content').notNull(),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('idx_email_components_type_active').on(t.type, t.is_active)],
);

// ─── Plantillas ────────────────────────────────────────────────────────
export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body_html: text('body_html').notNull(),
  header_id: uuid('header_id').references(() => emailComponents.id, {
    onDelete: 'set null',
  }),
  footer_id: uuid('footer_id').references(() => emailComponents.id, {
    onDelete: 'set null',
  }),
  variables: jsonb('variables').default(sql`'[]'::jsonb`),
  is_active: boolean('is_active').notNull().default(true),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});

// ─── Preferencias de marketing ────────────────────────────────────────
export const marketingPreferences = pgTable('marketing_preferences', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  is_subscribed: boolean('is_subscribed').notNull().default(true),
  categories: text('categories')
    .array()
    .notNull()
    .default(sql`ARRAY['announcements']::text[]`),
  unsubscribed_at: timestamp('unsubscribed_at', { withTimezone: true }),
  source: text('source'),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Segmentos ────────────────────────────────────────────────────────
export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  type: segmentTypeEnum('type').notNull().default('dynamic'),
  filters: jsonb('filters'),
  category: text('category').notNull().default('announcements'),
  is_active: boolean('is_active').notNull().default(true),
  estimated_count: integer('estimated_count').default(0),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});

export const segmentUsers = pgTable(
  'segment_users',
  {
    segment_id: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    added_at: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_segment_users_user').on(t.user_id)],
);

// ─── Campañas ─────────────────────────────────────────────────────────
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    template_id: uuid('template_id').references(() => emailTemplates.id, {
      onDelete: 'set null',
    }),
    subject_override: text('subject_override'),
    body_override: text('body_override'),
    category: text('category').notNull().default('announcements'),
    segment_ids: uuid('segment_ids')
      .array()
      .default(sql`'{}'::uuid[]`),
    include_user_ids: uuid('include_user_ids')
      .array()
      .default(sql`'{}'::uuid[]`),
    exclude_user_ids: uuid('exclude_user_ids')
      .array()
      .default(sql`'{}'::uuid[]`),
    status: campaignStatusEnum('status').notNull().default('draft'),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    total_recipients: integer('total_recipients').default(0),
    total_sent: integer('total_sent').default(0),
    total_delivered: integer('total_delivered').default(0),
    total_opened: integer('total_opened').default(0),
    total_clicked: integer('total_clicked').default(0),
    total_bounced: integer('total_bounced').default(0),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_campaigns_status').on(t.status),
    index('idx_campaigns_scheduled').on(t.scheduled_at),
  ],
);

// ─── Envíos individuales (cola) ───────────────────────────────────────
export const emailSends = pgTable(
  'email_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id'),
    email: text('email').notNull(),
    resend_id: text('resend_id'),
    status: emailSendStatusEnum('status').notNull().default('queued'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    opened_at: timestamp('opened_at', { withTimezone: true }),
    clicked_at: timestamp('clicked_at', { withTimezone: true }),
    bounced_at: timestamp('bounced_at', { withTimezone: true }),
    error_message: text('error_message'),
    variables_used: jsonb('variables_used'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_email_sends_campaign').on(t.campaign_id),
    index('idx_email_sends_user').on(t.user_id),
    index('idx_email_sends_resend_id').on(t.resend_id),
    index('idx_email_sends_status').on(t.status),
    index('idx_email_sends_queued')
      .on(t.campaign_id, t.created_at)
      .where(sql`status = 'queued'`),
  ],
);
