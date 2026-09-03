import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { couponTypeEnum } from './enums';

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: `null` = cupón global de plataforma (creado en admin), aplicable
  // a ofertas de cualquier negocio. Los cupones de negocio lo setean siempre.
  business_id: uuid('business_id').references(() => businesses.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: couponTypeEnum('type').notNull(),
  value: numeric('value').notNull(),
  min_order_amount: numeric('min_order_amount').default('0'),
  max_uses: integer('max_uses'),
  used_count: integer('used_count').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
