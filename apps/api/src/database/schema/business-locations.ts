import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const businessLocations = pgTable('business_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  phone: text('phone'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  zone: text('zone'),
  is_headquarter: boolean('is_headquarter').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
