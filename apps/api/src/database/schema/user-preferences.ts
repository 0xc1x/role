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

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  notification_radius_km: integer('notification_radius_km').default(5),
  favorite_categories: text('favorite_categories')
    .array()
    .default([]),
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
      .references(() => profiles.id),
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

export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
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
  },
);
