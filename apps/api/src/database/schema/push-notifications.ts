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
import { campaigns } from './email-marketing';
import { profiles } from './profiles';

export const pushSendStatusEnum = pgEnum('push_send_status', [
  'pending',
  'queued',
  'sent',
  'failed',
]);

/** Espejo de public.push_templates (Supabase). created_by apunta a auth.users. */
export const pushTemplates = pgTable('push_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
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

/** Espejo de public.push_notifications (Supabase): historial de envíos manuales. */
export const pushNotifications = pgTable('push_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  template_id: uuid('template_id'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  type: text('type').notNull().default('announcement'),
  segment_ids: uuid('segment_ids').array().notNull().default([]),
  include_user_ids: uuid('include_user_ids').array().notNull().default([]),
  exclude_user_ids: uuid('exclude_user_ids').array().notNull().default([]),
  total_targeted: integer('total_targeted').notNull().default(0),
  sent_count: integer('sent_count').notNull().default(0),
  failed_count: integer('failed_count').notNull().default(0),
  status: text('status').notNull().default('sent'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Ledger por destinatario de campañas push (espejo del patrón email_sends):
 * una fila por usuario de la audiencia; BullMQ solo ejecuta, la BD es la
 * fuente de verdad para reintentos y conteos.
 */
export const pushSends = pgTable(
  'push_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: pushSendStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    max_attempts: integer('max_attempts').notNull().default(3),
    last_error: text('last_error'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('push_sends_campaign_status_idx').on(t.campaign_id, t.status)],
);
