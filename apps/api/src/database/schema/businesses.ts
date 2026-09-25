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

// Solo datos públicos: `owner_id`, `balance`, `commission_rate` y el estado de
// moderación viven en business_ownership / business_finance /
// business_moderation (ver business-companions.ts) para que anon pueda tener
// SELECT de tabla sobre `businesses`, que PostgREST necesita para resolver
// relaciones.
export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
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
  currency: text('currency').notNull().default('USD'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
