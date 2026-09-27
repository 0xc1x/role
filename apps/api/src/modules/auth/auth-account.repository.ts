import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessOwnership,
  consumerNotificationPreferences,
  deviceTokens,
  favorites,
  marketingPreferences,
  orderEvents,
  orders,
  profiles,
  reviews,
  userConsents,
  userPreferences,
} from '../../database/schema';

/**
 * Rows that point at a profile and belong to somebody ELSE — a customer's
 * sale, a business's owner, a business's public rating. None of them is the
 * account's to delete, and in Supabase several of them CASCADE from
 * `profiles`, so an erase that does not check them does not erase the account,
 * it erases the platform.
 */
export interface RetainedRecords {
  orders: number;
  businesses: number;
  reviews: number;
}

/**
 * The database half of account self-deletion.
 *
 * WHY A REPOSITORY AND NOT MORE `DRIZZLE` IN `AuthService`: the interesting
 * decision here is a fork whose two branches must not be able to disagree, and
 * the arguments for it are all about WHAT SURVIVES a delete. That reasoning
 * belongs next to the statements that decide it, and the spec that proves the
 * orders and `business_finance.balance` survive has to assert against real rows.
 *
 * AUTHORISATION: every statement here is keyed on the CALLER's id, which comes
 * from the token subject and never from a body or a path segment — same rule,
 * and same reason, as `MeRepository`: the API connects as the `postgres`
 * pooler role, which owns `profiles`, `orders` and `device_tokens` and is
 * therefore exempt from RLS. The `where id = $1` IS the access control.
 */
@Injectable()
export class AuthAccountRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * What would be destroyed, or rewritten, by erasing this profile.
   *
   * ORDERS ARE THE HEADLINE, and the reason is a foreign key: in Supabase,
   * `orders.user_id` is `REFERENCES public.profiles(id) ON DELETE CASCADE`
   * (`20260507193539`). Deleting the profile deletes the sale record the
   * business reconciles payouts against — `price`, `commission_rate`,
   * `platform_fee` and `net_amount` are the frozen snapshot the payout maths is
   * built from, and `business_finance.balance` was accrued from them. A person's
   * data-deletion request would silently become a company's accounting incident.
   *
   * BUT ORDERS ALONE ARE NOT THE CONDITION, and the other two are the reason
   * this method exists rather than a single `countOrders`:
   *
   *  - `businesses` — ownership moved to `business_ownership`, whose `owner_id`
   *    is `ON DELETE CASCADE` from `profiles`. A business owner who never placed
   *    an order passes a "no orders" test, and erasing their profile takes the
   *    business with it — and with it every order that business's OTHER
   *    customers placed, since `orders.business_id` cascades too. That is a
   *    stranger's purchase destroyed by somebody else's account deletion.
   *  - `reviews` — `reviews.user_id` is also `ON DELETE CASCADE`, and a review
   *    is a business's public rating. Deleting the author's account would move
   *    that business's score without anybody deciding to move it.
   *
   * So the hard-delete branch is entered only when this returns all zeroes, and
   * anything else falls to the anonymise branch, which keeps every one of these
   * rows and removes only the columns that describe a person.
   */
  async countRetained(userId: string): Promise<RetainedRecords> {
    const [orderCount] = await this.db
      .select({ c: count() })
      .from(orders)
      .where(eq(orders.user_id, userId));
    const [businessCount] = await this.db
      .select({ c: count() })
      .from(businessOwnership)
      .where(eq(businessOwnership.owner_id, userId));
    const [reviewCount] = await this.db
      .select({ c: count() })
      .from(reviews)
      .where(eq(reviews.user_id, userId));

    return {
      orders: Number(orderCount?.c ?? 0),
      businesses: Number(businessCount?.c ?? 0),
      reviews: Number(reviewCount?.c ?? 0),
    };
  }

  /**
   * ANONYMISE, NOT DELETE.
   *
   * The row survives because the money does: `orders`, `order_events`, reviews
   * and the business balances derived from orders all point at `profiles.id`, and
   * that id is the only thing that can be a stable key for them once the person
   * is gone. So the question is not "which rows do we keep" but "which columns
   * still describe a person".
   *
   * SCRUBBED, and why each one:
   *
   *  - `email` — the primary identifier, and NOT NULL, so it is replaced rather
   *    than nulled. The sentinel embeds the row id and uses `.invalid`, a domain
   *    reserved by RFC 2606 that can never resolve: still a syntactically valid
   *    address, so every reader that validates this column keeps working, while
   *    being undeliverable and carrying no name, domain or mailbox.
   *  - `full_name`, `avatar_url`, `phone`, `city` — the remaining self-supplied
   *    personal data. Nulled, not blanked: an empty string is still a value the
   *    UI has to special-case, and `full_name` renders in the public review feed
   *    where an empty name is indistinguishable from a bug.
   *
   * NOT SCRUBBED, and why:
   *
   *  - `id` — the join key for every surviving row. Scrubbing it would be the
   *    deletion this branch exists to avoid.
   *  - `role` — platform state, not personal data, and this service must not be
   *    able to change it from any of these endpoints. Rewriting it would also
   *    quietly move the platform's user/admin headcount, which is an accounting
   *    fact about the platform, not about the person.
   *  - `created_at` — the account's age. Cohort reporting needs it and it
   *    identifies nobody. `updated_at` does move, because the row was written;
   *    that is what the column is for.
   *
   * The two extra statements are not cosmetics:
   *
   *  - `marketing_preferences.is_subscribed = false` — a scrubbed row that stays
   *    subscribed is a row the campaign engine keeps resolving as a recipient
   *    (`findSubscribedRecipients` joins `profiles` and reads `lower(p.email)`),
   *    so the platform would keep mailing an address the person asked to stop
   *    being reachable at. Update only, never insert: this API does not create
   *    that row, and one that was never seeded has nothing to unsubscribe.
   *  - `device_tokens.is_active = false` — `NotificationsRepository` reads tokens
   *    `where user_id = any($1) and is_active = true`. An active push token
   *    beside a surviving profile is a working channel to a phone belonging to
   *    somebody who just deleted the account, and it is the one thing the two
   *    branches differ on for a reason that is not PII: this branch has no
   *    profile cascade to inherit it from.
   *
   * `user_consents` is deliberately left alone: it holds no personal data of its
   * own (`user_id`, `consent_type`, `granted`, timestamps) and it is the proof
   * of what was consented to. A consumer-protection claim needs that ledger to
   * outlive the person.
   *
   * REVIEWS ARE DELETED, not blanked. A `reviews.comment` is personal data the
   * person wrote and it renders publicly, attributed, beside a business name —
   * so leaving it is not erasure, it is publication. A review is also the
   * business's rating, which is why this was an explicit decision and not an
   * obvious one, and why the rejected alternative is recorded here: blanking the
   * body and keeping the score. A score is a fact about a transaction and
   * survives the person; the words are theirs and do not.
   *
   * The average is not recomputed by hand. `on_review_change` and
   * `on_review_offer_change` are `AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW`,
   * so deleting the row fires both and rewrites `businesses.rating`,
   * `businesses.review_count`, `offers.rating` and `offers.review_count` from
   * what is left. Writing those updates here would be a second source of truth
   * for a calculation the database already owns, and it would be the one that
   * drifts.
   *
   * One transaction, because a half-scrubbed profile is worse than either
   * outcome: a row that is no longer identifiable but is still subscribed and
   * still pushable is precisely the failure this method exists to make
   * impossible.
   */
  async anonymise(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          email: `anonymized-${userId}@role.invalid`,
          full_name: null,
          avatar_url: null,
          phone: null,
          city: null,
          updated_at: new Date(),
        })
        .where(eq(profiles.id, userId));

      await tx
        .update(marketingPreferences)
        .set({ is_subscribed: false, unsubscribed_at: new Date() })
        .where(eq(marketingPreferences.user_id, userId));

      await tx
        .update(deviceTokens)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(deviceTokens.user_id, userId));

      // Last, so the rating triggers see the profile still in place. Deleting a
      // review fires `on_review_change` and `on_review_offer_change`, which read
      // `businesses` and `offers` to rewrite the averages; running this after the
      // scrub keeps the transaction readable top to bottom — identity first, then
      // what the person can no longer be reached at, then what they published.
      await tx.delete(reviews).where(eq(reviews.user_id, userId));
    });
  }

  /**
   * HARD DELETE, for an account `countRetained` cleared.
   *
   * The account's own rows go first, explicitly, and the reason is not
   * preference: it is that the Drizzle mirror and Supabase disagree about
   * referential actions. `drizzle-kit pull` writes a bare `REFERENCES` and drops
   * the `ON DELETE CASCADE` clause, so in this repo's own test database
   * `user_preferences`, `user_consents`, `device_tokens`, `favorites`, `reviews`
   * and `orders` all reference `profiles` with NO ACTION — while in Supabase
   * they cascade. A delete that "works because of the cascade" therefore works
   * in production and raises 23503 in every spec, and a statement whose
   * correctness depends on a clause the tests cannot see is not verifiable.
   * Writing the deletes here makes the branch true in both.
   *
   * `consumer_notification_preferences.user_id` is the one child that is NO
   * ACTION in SUPABASE as well (`20260616015353`, `references public.profiles(id)`
   * with no referential action). Every account gets that row from the seeder or
   * the trigger chain, so a hard delete of a `profiles` row raises 23503 in
   * production too — which means "no orders, so delete the profile" is not a
   * working plan without this statement, for a reason that has nothing to do with
   * orders at all.
   *
   * `order_events.changed_by` is the odd one out and is DETACHED rather than
   * deleted: it is `ON DELETE SET NULL` in Supabase, and the rows belong to other
   * people's orders. `validate_pickup_code` writes the caller's id there, so an
   * employee with no orders and no business can still be named on an event
   * ledger that is not theirs to erase.
   *
   * Not listed, because they cascade in BOTH places and are this account's own:
   * `marketing_preferences`, `segment_users`, `push_sends`, `saved_addresses`,
   * `business_ownership` (zero by the gate, and deleting a business here would
   * be the cascade disaster `countRetained` exists to prevent).
   *
   * One transaction: a partial erase is the one outcome that is worse than not
   * erasing at all.
   */
  async eraseAccount(userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(consumerNotificationPreferences)
        .where(eq(consumerNotificationPreferences.user_id, userId));
      await tx
        .delete(userPreferences)
        .where(eq(userPreferences.user_id, userId));
      await tx.delete(userConsents).where(eq(userConsents.user_id, userId));
      await tx.delete(deviceTokens).where(eq(deviceTokens.user_id, userId));
      await tx.delete(favorites).where(eq(favorites.user_id, userId));
      await tx
        .update(orderEvents)
        .set({ changed_by: null })
        .where(eq(orderEvents.changed_by, userId));

      const rows = await tx
        .delete(profiles)
        .where(eq(profiles.id, userId))
        .returning({ id: profiles.id });
      return rows.length > 0;
    });
  }
}
