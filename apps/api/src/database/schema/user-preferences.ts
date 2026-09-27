import {
  boolean,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

// MIRROR GAP — read before trusting this file against the live database.
// The live `public` schema has two unique constraints this mirror does not
// declare, because drizzle-kit models a plain unique index only as a bare
// `uniqueIndex(...)` and `db:pull` does not emit one here:
//
//   user_preferences_user_id_key                UNIQUE (user_id)
//   user_consents_user_id_consent_type_key      UNIQUE (user_id, consent_type)
//
// They are load-bearing, not cosmetic: `UserDefaultsService` mirrors the
// trigger's `ON CONFLICT (user_id)` clauses, and without the constraint Postgres
// rejects the inference with 42P10. `apps/api/test/db.ts` adds them to the test
// database for that reason.
//
// `.unique()` is deliberately NOT declared here. This package generates
// migrations under `apps/api/drizzle/`, and a schema-level `.unique()` would
// make `drizzle-kit generate` emit an `ADD CONSTRAINT` for something production
// already has, which fails on apply. Fixing the mirror is a decision that needs
// its own migration, not a drive-by in a mirror that is applied out of band.

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, {
      onDelete: 'cascade',
    }),
  notification_radius_km: integer('notification_radius_km').default(5),
  favorite_categories: text('favorite_categories').array().default([]),
  language: text('language').default('es'),
  theme_mode: text('theme_mode').notNull().default('system'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consumerNotificationPreferences = pgTable(
  'consumer_notification_preferences',
  {
    user_id: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'no action' }),
    push_enabled: boolean('push_enabled').notNull().default(true),
    email_enabled: boolean('email_enabled').notNull().default(true),
    sms_enabled: boolean('sms_enabled').notNull().default(false),
    whatsapp_enabled: boolean('whatsapp_enabled').notNull().default(false),
    favorite_alerts_enabled: boolean('favorite_alerts_enabled')
      .notNull()
      .default(true),
    pickup_reminders_enabled: boolean('pickup_reminders_enabled')
      .notNull()
      .default(true),
    last_minute_deals_enabled: boolean('last_minute_deals_enabled')
      .notNull()
      .default(false),
    weekly_summary_enabled: boolean('weekly_summary_enabled')
      .notNull()
      .default(true),
    quiet_hours_from: time('quiet_hours_from'),
    quiet_hours_to: time('quiet_hours_to'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const userConsents = pgTable('user_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, {
      onDelete: 'cascade',
    }),
  consent_type: text('consent_type').notNull(),
  granted: boolean('granted').notNull().default(false),
  granted_at: timestamp('granted_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
