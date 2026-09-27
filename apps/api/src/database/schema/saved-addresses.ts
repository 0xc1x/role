import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/**
 * The consumer's own address book, one row per saved address.
 *
 * This is a SURPLUS-FOOD marketplace, not a delivery one: the consumer reserves
 * an offer and collects it at the business location the offer points at, so
 * `orders` carries no address at all. What this table is for is proximity — the
 * profile address book, and `supabase/functions/dispatch-nearby-offers`, which
 * reads the user's default row to decide which nearby offers are worth notifying
 * about.
 *
 * WHY THE API MIRRORS IT NOW: mobile manages this table straight through
 * PostgREST under RLS (ADR-0002) and the API had no route for it, so the cutover
 * would have lost the address book. The RLS policies are owner-only on all four
 * verbs and, unlike every other table in this schema, carry no admin bypass —
 * so these owner-scoped routes widen nothing: the API can only ever do what the
 * calling user's own policy already allowed.
 *
 * MIRROR GAP: this table is declared here and created by the test harness, but it
 * is NOT in the checked-in `drizzle/` migration folders — see the note in
 * `test/db.ts`. This declaration mirrors the live `public.saved_addresses`; it is
 * not a redesign of it. Two objects the live table has are NOT declared here:
 *
 *   idx_saved_addresses_user   INDEX (user_id)
 *   set_saved_addresses_updated_at   BEFORE UPDATE trigger
 *
 * The index is the one that serves every read in the module — the service only
 * ever queries `where user_id = $1` — and it is left undeclared for the same
 * reason `favorites_user_id_offer_id_key` and
 * `user_preferences_user_id_key` are: this package generates migrations under
 * `drizzle/`, and declaring an object the live database already has would make
 * `drizzle-kit generate` emit DDL that fails on apply. The trigger is the
 * reason the repository also writes `updated_at` explicitly: the mirror-based
 * test database has no triggers, and setting it here is what every other
 * repository in this API does anyway.
 *
 * INVARIANT — AND IT IS NOT ENFORCED HERE: at most one row per user with
 * `is_default = true`. The live table has a primary key and the foreign key to
 * profiles and NOTHING else — no unique, no partial unique index, no trigger.
 * Two default rows are therefore writable directly in SQL, and
 * `dispatch-nearby-offers` would then pick one of them arbitrarily
 * (`userAddressMap.set` over an unordered result set) and notify the user about
 * offers near an address they may not have chosen. That is why every write that
 * can set the flag goes through `SavedAddressesService`, inside a transaction,
 * and why the comment there says so out loud. A partial unique index
 * (`unique (user_id) where is_default`) is the real fix, but it is DDL: it
 * belongs in a Supabase migration, which this change is not allowed to write.
 */
export const savedAddresses = pgTable('saved_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  address: text('address').notNull(),
  // Bare `numeric` on purpose: the live columns carry no precision or scale, and
  // postgres-js hands `numeric` back as a string, so the mapper coerces through
  // `toNumber` the way the location and review mappers already do.
  latitude: numeric('latitude').notNull(),
  longitude: numeric('longitude').notNull(),
  is_default: boolean('is_default').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  type: text('type').notNull().default('home'),
  references: text('references'),
  housing_type: text('housing_type'),
});
