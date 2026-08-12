import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessLocations } from './business-locations';
import { businesses } from './businesses';

export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  business_location_id: uuid('business_location_id')
    .notNull()
    .references(() => businessLocations.id),
  title: text('title').notNull(),
  description: text('description'),
  image: text('image'),
  original_price: numeric('original_price', { precision: 12, scale: 2 }).notNull(),
  discounted_price: numeric('discounted_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  discount_percentage: numeric('discount_percentage', {
    precision: 8,
    scale: 2,
  }),
  stock: integer('stock').notNull().default(1),
  initial_stock: integer('initial_stock').notNull().default(1),
  pickup_start: timestamp('pickup_start', { withTimezone: true }).notNull(),
  pickup_end: timestamp('pickup_end', { withTimezone: true }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  includes: text('includes'),
  allergens: text('allergens'),
  rating: numeric('rating', { precision: 10, scale: 2 }).notNull().default('0'),
  review_count: integer('review_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
