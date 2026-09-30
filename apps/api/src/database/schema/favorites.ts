import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { offers } from './offers';
import { profiles } from './profiles';

// MIRROR GAP — read before trusting this file against the live database.
// The live `public` schema has a unique constraint this mirror does not declare:
//
//   favorites_user_id_offer_id_key   UNIQUE (user_id, offer_id)
//
// It is load-bearing: `FavoritesRepository.insertIfAbsent` mirrors the trigger
// `on conflict (user_id, offer_id) do nothing` style, and without the constraint
// Postgres rejects the inference with 42P10 — the insert that is supposed to be
// idempotent would fail instead. `apps/api/test/db.ts` adds it to the test
// database for that reason.
//
// `.unique()` is deliberately NOT declared here. This package generates
// migrations under `apps/api/drizzle/`, and a schema-level `.unique()` would make
// `drizzle-kit generate` emit an `ADD CONSTRAINT` for something production
// already has, which fails on apply. Same reasoning, same pattern and same
// trade-off as the gap documented in `user-preferences.ts`: fixing the mirror
// needs its own migration, not a drive-by in a mirror applied out of band.

export const favorites = pgTable('favorites', {
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
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
