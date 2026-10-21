import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { profiles } from './profiles';

/**
 * Companions of `businesses` (one row per business).
 *
 * WHY: `public.businesses` is read by anon through PostgREST (the offers
 * catalog needs table-level SELECT on the referenced table to resolve
 * relationships). Column-level grants cannot hide a column, so the columns
 * that must not be public left the table that anon must be able to read:
 *
 *   business_finance    → balance, commission_rate
 *   business_moderation → verification_status, verified_at, verified_by,
 *                         rejection_reason
 *
 * INVARIANT: every business has exactly one row in each companion. The API
 * writes all three rows in the same transaction (BusinessesRepository.insert /
 * .update) and Supabase backfilled the tables when they were created, so a
 * business without companions is a broken invariant, not a normal state.
 * Aggregate reads inner-join them for that reason.
 *
 * These mirror the tables created in Supabase; see
 * supabase/migrations/20260925225227_businesses_companion_tables.sql.
 *
 * ─── LO QUE NO ESTÁ AQUÍ, Y POR QUÉ ────────────────────────────────────────
 *
 * La fila de propiedad (`business_ownership`) se retiró con la tabla: el dueño
 * de un negocio es su fila de `business_members`, que es lo que escriben el
 * trigger `trg_bootstrap_business_companions` y el alta del API. El espejo
 * declara lo que la base tiene, y la base ya no tiene esa tabla.
 */
export const businessFinance = pgTable('business_finance', {
  business_id: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 12, scale: 2 })
    .notNull()
    .default('0.00'),
  commission_rate: numeric('commission_rate', { precision: 10, scale: 4 })
    .notNull()
    .default('0.1000'),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const businessModeration = pgTable('business_moderation', {
  business_id: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  verification_status: text('verification_status').notNull().default('pending'),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  verified_by: uuid('verified_by').references(() => profiles.id, {
    onDelete: 'no action',
  }),
  rejection_reason: text('rejection_reason'),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
