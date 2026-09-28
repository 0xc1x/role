import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { paymentGatewayEnum } from './enums';
import { profiles } from './profiles';

/**
 * The caller's tokenized payment methods — one row per saved card.
 *
 * PCI DSS (ADR-0007): no PAN and no CVV are ever stored. What this table holds
 * is the gateway's instrument handle plus the display metadata needed to render
 * a card, and the business model is pay-at-pickup, so `place_to_pay` is a REAL
 * gateway value rather than a placeholder.
 *
 * WHY THE API MIRRORS IT NOW: mobile manages this table straight through
 * PostgREST under RLS (ADR-0002) — `profileRepository.getPaymentMethods` reads
 * it and `setDefaultPaymentMethod` / `deletePaymentMethod` write it — and the API
 * had no route for it. The single RLS policy, `Users manage own payment
 * methods`, is `FOR ALL USING ((select auth.uid()) = user_id)`: owner-only on
 * every verb, with no admin bypass, exactly like `saved_addresses`. These
 * owner-scoped routes therefore widen nothing.
 *
 * MIRROR GAP: this table is declared here and created by the test harness, but
 * it is NOT in the checked-in `drizzle/` migration folders — see the note in
 * `test/db.ts`. This declaration mirrors the live `public.payment_methods`; it
 * is not a redesign of it. Four objects the live table has are NOT declared
 * here, and each is left out for the same reason `favorites` and
 * `user-preferences` leave theirs out: this package generates migrations under
 * `apps/api/drizzle/`, and declaring an object production already has would make
 * `drizzle-kit generate` emit DDL that fails on apply.
 *
 *   payment_methods_exp_month_check   CHECK (exp_month >= 1 AND exp_month <= 12)
 *   payment_methods_last4_check       CHECK (char_length(last4) = 4)
 *   idx_payment_methods_user          INDEX (user_id)  — NOT unique
 *
 * The two CHECKs are load-bearing rather than cosmetic: they are the only thing
 * in the schema that can keep an `exp_month` of 0 or 13, or a `last4` that is
 * not four characters, out of the table. `apps/api/test/db.ts` adds them to the
 * test database for that reason, and the mirror-fidelity assertions in
 * `payment-methods.service.db.spec.ts` prove they are actually there — a
 * harness that silently dropped them would allow exactly the bad rows production
 * forbids, and the whole suite would be green.
 *
 * `.check()` is deliberately NOT used for them. Drizzle cannot express a CHECK
 * on this column set without a schema-level constraint, and a schema-level
 * `.check()` is a `drizzle-kit generate` DDL emission for something the live
 * database has held since `20260822231809_commissions_payouts_payment_methods`.
 * Fixing the mirror properly needs its own migration, not a drive-by in a mirror
 * applied out of band — the same trade-off, and the same reasoning, as the gaps
 * documented in `favorites.ts`, `coupons.ts` and `user-preferences.ts`.
 *
 * KNOWN MODELLING DIVERGENCE — `user_id` points at `profiles`, not at
 * `auth.users`. The live constraint is
 * `payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
 * ON DELETE CASCADE`, and the mirror cannot name `auth.users` without a stub for
 * a schema the test harness does not create. `profiles` is the closest thing it
 * CAN say, and it is what CI generates. The difference is observable rather than
 * cosmetic — under `profiles` the cascade follows a profile delete, under
 * `auth.users` an auth-user delete — and nothing in the delete path of this
 * module depends on it, because a soft delete is the only removal here (see
 * `PaymentMethodsRepository.softDeleteOwned`). It is recorded in both directions:
 * here, and as an expectation in `mirror-fidelity.db.spec.ts`, which asserts
 * referential actions in BOTH directions and would otherwise fail on an unknown
 * foreign key.
 *
 * INVARIANT — AND IT IS NOT ENFORCED HERE: at most one row per user with
 * `is_default = true`. `idx_payment_methods_user` is NOT unique and there is no
 * partial unique index on `is_default`, so two default rows are writable in
 * plain SQL today. `PaymentMethodsService.setDefault` is the only enforcement
 * point on this path, and it takes a per-user advisory lock to make the
 * clear-then-set sequence one decision. The real fix is the same partial unique
 * index that `20260927141632_saved_addresses_one_default` added for addresses —
 * `unique (user_id) where is_default and deleted_at is null` — but that is DDL:
 * it belongs in a Supabase migration, which this change is not allowed to write.
 */
export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  gateway: paymentGatewayEnum('gateway').notNull().default('place_to_pay'),
  // DECLARED ON PURPOSE, and never projected. This column is the stored
  // instrument handle and a bearer for the gateway, which is exactly what makes
  // it the one column here whose disclosure turns a card-metadata leak into a
  // chargeable one. It has to exist in the mirror — the row is what the database
  // holds — but the projection in `PaymentMethodsMapper.toDto` is a hand-written
  // allowlist that does not name it, and that allowlist is the guarantee.
  gateway_token: text('gateway_token').notNull(),
  brand: text('brand').notNull(),
  // Length-only in the database (`char_length(last4) = 4`). The response
  // contract in commons additionally requires four digits; see the note there.
  last4: text('last4').notNull(),
  exp_month: integer('exp_month').notNull(),
  exp_year: integer('exp_year').notNull(),
  holder_name: text('holder_name').notNull(),
  is_default: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // WRITTEN BY THE REPOSITORY, NOT BY A TRIGGER — verified, not assumed. No
  // trigger maintains `updated_at` on this table: the only two migrations that
  // touch it are `20260822231809_commissions_payouts_payment_methods` (which
  // creates it) and `20260925155451_performance_advisors` (which adds the index
  // and rewrites the policy), and neither creates a trigger. Contrast
  // `saved_addresses`, whose `set_saved_addresses_updated_at` trigger is a real
  // object this mirror also omits. So every write in this module sets
  // `updated_at` by hand, which is what every other repository in this API does
  // anyway — and the test database must NOT grow a trigger it does not have in
  // production, or a stale `updated_at` would pass for the wrong reason.
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
