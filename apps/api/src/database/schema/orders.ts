import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { coupons } from './coupons';
import { orderStatusEnum } from './enums';
import { offers } from './offers';
import { profiles } from './profiles';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, {
      onDelete: 'cascade',
    }),
  offer_id: uuid('offer_id')
    .notNull()
    .references(() => offers.id, {
      onDelete: 'cascade',
    }),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id, {
      onDelete: 'cascade',
    }),
  order_number: text('order_number').notNull().unique(),
  idempotency_key: text('idempotency_key'),
  status: orderStatusEnum('status').notNull().default('pending'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  original_price: numeric('original_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  pickup_code: text('pickup_code').notNull(),
  pickup_time: timestamp('pickup_time', { withTimezone: true }),
  // SET NULL, matching the database: a coupon can be hard-deleted when it is
  // retired, and the order has to outlive it — the order is the financial
  // record. No CASCADE here on purpose, the order is the platform's.
  coupon_id: uuid('coupon_id').references(() => coupons.id, {
    onDelete: 'set null',
  }),
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
    .references(() => orders.id, {
      onDelete: 'cascade',
    }),
  status: orderStatusEnum('status').notNull(),
  previous_status: orderStatusEnum('previous_status'),
  changed_by: uuid('changed_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  reason: text('reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
