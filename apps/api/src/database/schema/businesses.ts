import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTypeEnum } from './enums';
import { profiles } from './profiles';

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_id: uuid('owner_id')
    .notNull()
    .references(() => profiles.id),
  name: text('name').notNull(),
  type: businessTypeEnum('type').notNull().default('restaurant'),
  slug: text('slug').notNull().unique(),
  image: text('image'),
  cover_image: text('cover_image'),
  rating: numeric('rating', { precision: 10, scale: 2 }).default('0'),
  review_count: integer('review_count').default(0),
  description: text('description'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  commission_rate: numeric('commission_rate', { precision: 10, scale: 4 }).default(
    '0.1000',
  ),
  balance: numeric('balance', { precision: 12, scale: 2 }).default('0.00'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
