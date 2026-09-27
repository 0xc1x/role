import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

// Note: the table also carries a `geog` column (PostGIS `geography`, GENERATED
// ALWAYS — ADR-0010) that exists only in Supabase. It is deliberately NOT
// declared in this mirror: Drizzle cannot model a generated PostGIS column, and
// the mirror is a portable offline artifact that must not require an extension
// to introspect. The specs that need it install it in the harness instead (see
// the MIRROR GAP item 5 in test/db.ts), and the queries that use it reach it
// through raw SQL qualified as `extensions.st_*`.

export const businessLocations = pgTable(
  'business_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    business_id: uuid('business_id')
      .notNull()
      .references(() => businesses.id, {
        onDelete: 'cascade',
      }),
    name: text('name').notNull(),
    address: text('address').notNull(),
    phone: text('phone'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    zone: text('zone'),
    is_headquarter: boolean('is_headquarter').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('business_locations_id_business_id_key').on(
      table.id,
      table.business_id,
    ),
  ],
);
