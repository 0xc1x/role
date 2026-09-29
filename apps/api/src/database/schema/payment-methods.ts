import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
 * THE TEST DATABASE IS BUILT FROM THIS DECLARATION, so the two CHECKs are
 * declared here as table-level `.check()` constraints rather than patched in by
 * the harness. This declaration mirrors the live `public.payment_methods`; it is
 * not a redesign of it.
 *
 *   payment_methods_exp_month_check   CHECK (exp_month >= 1 AND exp_month <= 12)
 *   payment_methods_last4_check       CHECK (char_length(last4) = 4)
 *
 * The two CHECKs are load-bearing rather than cosmetic: they are the only thing
 * in the schema that can keep an `exp_month` of 0 or 13, or a `last4` that is
 * not four characters, out of the table. They live HERE, not in `test/db.ts`,
 * because `apps/api/drizzle/` is generated from this file by
 * `drizzle-kit generate` and is the harness's only source of DDL (see the note
 * at the top of `test/db.ts`). When they were harness DDL instead, the mirror's
 * own `CREATE TABLE` won the `create table if not exists` race, the harness copy
 * silently became a no-op, and exactly the bad rows production forbids got
 * inserted under a green suite — three specs caught it, the 2204 that did not
 * check for it could not. The mirror-fidelity assertions in
 * `payment-methods.service.db.spec.ts` now assert them against a constraint the
 * generated mirror actually emits.
 *
 * ONE OBJECT IS STILL NOT DECLARED, and it is a deliberate one:
 *
 *   idx_payment_methods_user          INDEX (user_id)  — NOT unique
 *
 * It is left to the harness because it exists in neither the mirror nor
 * production's constraint set as something the schema can express without
 * colliding — see the note on `idx_payment_methods_one_default` below, which is
 * the same index family and stays out for the same reason.
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
 * INVARIANT — AND IT IS NOT ENFORCED BY THIS MIRROR: at most one row per user
 * with `is_default = true`. `idx_payment_methods_user` is NOT unique, and the
 * partial unique index that enforces the rule in the live database is not
 * declared here either. Production has it —
 * `20260928040349_payment_methods_one_default` added
 * `idx_payment_methods_one_default on (user_id) where is_default and deleted_at
 * is null`, the same shape `20260927141632_saved_addresses_one_default` added
 * for addresses. Declaring it in the mirror would make `drizzle-kit generate`
 * emit DDL for an object that already exists, which fails on apply; the test
 * harness omits it for the same reason, and the specs say so where they would
 * otherwise read as claims about production.
 *
 * That index does NOT replace `PaymentMethodsService.setDefault`: it closes the
 * concurrent case (the loser gets a 23505) and it does not close the window
 * between mobile's own two PostgREST statements, where the user briefly has no
 * default at all. The clear-then-set transaction is still what guarantees the
 * invariant rather than merely detecting a violation of it.
 */
export const paymentMethods = pgTable(
  'payment_methods',
  {
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
  },
  (table) => [
    // Verbatim from the live database, constraints included — the names are the
    // live names, so `pg_constraint.conname` in a spec names production's own
    // objects. `exp_month` is an INTEGER and `last4` a TEXT, so no cast or
    // collation question arises; this is length only, NOT the four-digits rule,
    // which lives in the response contract in commons.
    check(
      'payment_methods_exp_month_check',
      sql`${table.exp_month} >= 1 and ${table.exp_month} <= 12`,
    ),
    check('payment_methods_last4_check', sql`char_length(${table.last4}) = 4`),
  ],
);
