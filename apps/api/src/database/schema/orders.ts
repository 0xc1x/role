import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { orderStatusEnum } from './enums';
import { offers } from './offers';
import { profiles } from './profiles';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'no action' }),
  offer_id: uuid('offer_id')
    .notNull()
    .references(() => offers.id, { onDelete: 'no action' }),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'no action' }),
  order_number: text('order_number').notNull().unique(),
  status: orderStatusEnum('status').notNull().default('pending'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  original_price: numeric('original_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  pickup_code: text('pickup_code').notNull(),
  pickup_time: timestamp('pickup_time', { withTimezone: true }),
  coupon_id: uuid('coupon_id'),
  commission_rate: numeric('commission_rate', { precision: 10, scale: 4 })
    .notNull()
    .default('0.1000'),
  platform_fee: numeric('platform_fee', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  net_amount: numeric('net_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  payout_id: uuid('payout_id'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderEvents = pgTable('order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'no action' }),
  status: orderStatusEnum('status').notNull(),
  previous_status: orderStatusEnum('previous_status'),
  changed_by: uuid('changed_by').references(() => profiles.id, { onDelete: 'no action' }),
  reason: text('reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
