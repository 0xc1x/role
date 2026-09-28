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

// MIRROR GAP — read before trusting this file against the live database.
// The live `public` schema has a unique constraint this mirror does not declare:
//
//   coupons_business_id_code_key   UNIQUE (business_id, code)
//
// It is load-bearing in a way that is easy to misread, because Postgres treats
// NULLs as DISTINCT in a unique index and `business_id` is nullable:
//
//   - a code may legitimately exist once per business (the redemption lookup
//     ranks "this business" first, then the platform-wide coupon), and
//   - but TWO GLOBAL coupons with the same code are still ALLOWED, since
//     (NULL, 'PROMO10') <> (NULL, 'PROMO10') is not false in Postgres.
//
// That second point is the dangerous one: with two global rows on one code the
// `limit(1)` of the resolution read
// (`OrdersRepository.findCouponByCodeForUpdate` /
// `CouponsRepository.findApplicableByCode`, both ordering by `couponScopeRank`)
// becomes ambiguous, and the two reads could settle on different rows — the
// pre-check approving a code the reservation rejects as `wrong_business`.
// `CouponsService.assertGlobalCodeAvailable` is what keeps that from happening
// through this API; the constraint is what makes it a database-level fact
// instead of a service-level promise. `apps/api/test/db.ts` adds it to the test
// database for that reason, and `mirror-fidelity.db.spec.ts` asserts it is
// there, because a harness that silently drops it allows rows production
// forbids and hides exactly this ambiguity.
//
// `.unique()` is deliberately NOT declared here. This package generates
// migrations under `apps/api/drizzle/`, and a schema-level `.unique()` would make
// `drizzle-kit generate` emit an `ADD CONSTRAINT` for something production
// already has, which fails on apply. Same reasoning, same pattern and same
// trade-off as the gap documented in `favorites.ts`: fixing the mirror needs its
// own migration, not a drive-by in a mirror applied out of band.

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: `null` = cupón global de plataforma (creado en admin), aplicable
  // a ofertas de cualquier negocio. Los cupones de negocio lo setean siempre.
  business_id: uuid('business_id').references(() => businesses.id, {
    onDelete: 'cascade',
  }),
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
