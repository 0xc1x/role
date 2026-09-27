import { and, eq, sql, type SQL } from 'drizzle-orm';
import { businessModeration, businesses } from './schema';

/**
 * THE public-visibility gate for a business, in one place.
 *
 * Every surface that shows a business to somebody who did not sign in as its
 * owner — the offers catalog, the public business list, the storefront, the
 * review feeds — resolves through these three functions. They exist as a module
 * instead of as three private methods because the predicate had already been
 * copied twice (`OffersRepository.approvedBusiness` and
 * `BusinessesRepository.moderatedAs`) and a third copy is how a business that is
 * still in review ends up listable by one route and correctly hidden by the
 * other three.
 *
 * `verification_status` lives in the `business_moderation` companion, NOT on
 * `businesses`: the column left the table in
 * `20260927025753_businesses_drop_sensitive_columns.sql` because anon needs
 * table-level SELECT on `businesses` for PostgREST to resolve the offers embed,
 * and a column grant cannot hide a column from a table-level grant. Reading it
 * from `businesses` is a 42703 waiting to happen.
 */
export type BusinessModerationStatus = 'pending' | 'approved' | 'rejected';

/**
 * `exists (select 1 from business_moderation m where ...)` correlated to the
 * `businesses` row in the enclosing query.
 *
 * Written as `exists` rather than as a join for two reasons that both matter:
 * the count queries read `businesses` alone (a join would multiply the page
 * against the count), and a business with NO moderation row matches nothing —
 * which is what the old `verification_status text not null default 'pending'`
 * column on `businesses` used to mean. That default is gone; this predicate is
 * the replacement, and it has to keep failing closed on its own.
 */
export function moderationStatus(status: BusinessModerationStatus): SQL {
  return sql`exists (select 1 from ${businessModeration} m where m.business_id = ${businesses.id} and m.verification_status = ${status})`;
}

/** The business is moderation-approved. */
export function approvedBusiness(): SQL {
  return moderationStatus('approved');
}

/**
 * THE gate: a business that may appear on a public surface is active AND
 * moderation-approved.
 *
 * Order matters for readability only — `and()` does not care. Both halves are
 * required: `is_active` is the platform's kill switch (a business can be
 * deactivated while staying approved, and `BusinessesService.remove` does
 * exactly that), and approval is the merchant-review decision. Either one alone
 * publishes a business nobody cleared.
 *
 * A caller cannot widen this by passing a filter: the gate is applied inside the
 * repository next to the table it constrains, not derived from a query parameter.
 */
export function publiclyVisibleBusiness(): SQL {
  return and(eq(businesses.is_active, true), approvedBusiness()) as SQL;
}
