import {
  boolean,
  pgTable,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { dayOfWeekEnum } from './enums';

/**
 * Weekly opening schedule of a business, one row per weekday.
 *
 * WHY THE API MIRRORS A TABLE NOBODY READS: `business_hours` has existed in
 * Supabase since the businesses migration and the mobile reads it through
 * PostgREST (`business_hours` has a `using (true)` SELECT policy, so any reader
 * can see any schedule). Nothing in the API declared it, which is exactly why the
 * public storefront had to be assembled from two of its three parts.
 *
 * DECLARED IN THE SCHEMA, SO THE TEST DATABASE GETS IT FROM THE MIRROR. This
 * used to be a hand-written `create table if not exists` in `test/db.ts`
 * alongside a `pgTable` here, and the two raced: the mirror emitted its own
 * `CREATE TABLE` first, `if not exists` downgraded the harness copy to a
 * NOTICE, and the table existed by accident of which statement ran first. The
 * live table is the one from
 * `supabase/migrations/20260507193215_create_businesses_and_locations.sql`; this
 * declaration is that table, not a redesign of it.
 *
 * INVARIANT: at most one row per (business_id, day), enforced by the unique
 * constraint below. A schedule with two monday rows has no meaning, and the
 * storefront embeds this list as-is.
 */
export const businessHours = pgTable(
  'business_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    business_id: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    day: dayOfWeekEnum('day').notNull(),
    open_time: time('open_time').notNull(),
    close_time: time('close_time').notNull(),
    is_closed: boolean('is_closed').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Also the index that serves the storefront read: its leading column is
    // business_id, so `where business_id = $1` is an index range scan and the
    // weekday ordering is the incremental sort on top of it. The separate
    // `idx_business_hours_business` in the live database is redundant with this.
    unique('business_hours_business_id_day_key').on(
      table.business_id,
      table.day,
    ),
  ],
);

export type BusinessHoursRow = typeof businessHours.$inferSelect;
export type BusinessHoursInsert = typeof businessHours.$inferInsert;
