import {
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { payoutStatusEnum } from './enums';

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  period_start: date('period_start').notNull(),
  period_end: date('period_end').notNull(),
  gross_amount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
  platform_fee: numeric('platform_fee', { precision: 12, scale: 2 }).notNull(),
  net_amount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
  status: payoutStatusEnum('status').notNull().default('pending'),
  gateway_payout_id: text('gateway_payout_id'),
  paid_at: timestamp('paid_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
