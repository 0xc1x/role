import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
