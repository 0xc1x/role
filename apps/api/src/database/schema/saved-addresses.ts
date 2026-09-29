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
 * DECLARED IN THE SCHEMA, SO THE TEST DATABASE GETS IT FROM THE MIRROR. This
 * used to be a hand-written `create table if not exists` in `test/db.ts`
 * alongside a `pgTable` here, and the two raced: the mirror emitted its own
 * `CREATE TABLE` first, `if not exists` downgraded the harness copy to a
 * NOTICE, and the table existed by accident of which statement ran first. This
 * declaration mirrors the live `public.saved_addresses`; it is not a redesign of
 * it. Two objects the live table has are NOT declared here:
 *
 *   idx_saved_addresses_user   INDEX (user_id)
 *   set_saved_addresses_updated_at   BEFORE UPDATE trigger
 *
 * The index is the one that serves every read in the module — the service only
 * ever queries `where user_id = $1` — and it is left to the harness for the same
 * reason `favorites_user_id_offer_id_key` and `user_preferences_user_id_key` are
 * kept there: it is a secondary access path, not part of the table's shape, and
 * declaring it in both places would be a 42P07 the moment either side moved.
 * The trigger is the reason the repository also writes `updated_at` explicitly:
 * the mirror-based test database has no triggers, and setting it here is what
 * every other repository in this API does anyway.
 *
 * INVARIANT — enforced in the DATABASE, and deliberately NOT declared in this
 * mirror. At most one row per user with `is_default = true`, held by
 * `idx_saved_addresses_one_default` (`unique (user_id) where is_default`),
 * applied as `20260927141632_saved_addresses_one_default`. Two default rows are
 * therefore not writable even in plain SQL, and `dispatch-nearby-offers`
 * (`userAddressMap.set` over an unordered result set) can no longer be handed
 * two candidates.
 *
 * The index is omitted here for the same reason `favorites` omits its unique
 * and `payment_methods` omits its one-default index: this package generates
 * migrations under `apps/api/drizzle/`, and declaring it in the schema would
 * make `drizzle-kit generate` emit an `ADD CONSTRAINT` for something production
 * already has, which fails on apply. The harness omits it too, so the specs
 * below pin the SERVICE's transaction and not the index.
 *
 * The transaction is not redundant with the index. It closes a window the
 * index cannot: mobile writes this table through PostgREST in two separate
 * statements, so between its clear and its set the user has ZERO defaults —
 * which no unique index forbids, and which is exactly the state that stops
 * last-minute-deal notifications silently.
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
