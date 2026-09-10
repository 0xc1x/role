import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { orders } from './orders';
import { profiles } from './profiles';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'no action' }),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'no action' }),
  order_id: uuid('order_id').references(() => orders.id, { onDelete: 'no action' }),
  rating: integer('rating'),
  comment: text('comment'),
  product_rating: integer('product_rating'),
  business_rating: integer('business_rating'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
