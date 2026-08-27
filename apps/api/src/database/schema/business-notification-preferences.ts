import {
  boolean,
  pgTable,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const businessNotificationPreferences = pgTable(
  'business_notification_preferences',
  {
    business_id: uuid('business_id')
      .primaryKey()
      .references(() => businesses.id),
    push_enabled: boolean('push_enabled').notNull().default(true),
    email_enabled: boolean('email_enabled').notNull().default(true),
    sms_enabled: boolean('sms_enabled').notNull().default(false),
    whatsapp_enabled: boolean('whatsapp_enabled').notNull().default(false),
    new_orders_enabled: boolean('new_orders_enabled').notNull().default(true),
    pickup_ready_enabled: boolean('pickup_ready_enabled')
      .notNull()
      .default(true),
    reviews_enabled: boolean('reviews_enabled').notNull().default(true),
    low_stock_enabled: boolean('low_stock_enabled').notNull().default(false),
    daily_summary_enabled: boolean('daily_summary_enabled')
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
