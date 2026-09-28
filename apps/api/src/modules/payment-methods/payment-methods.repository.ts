import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { paymentMethods } from '../../database/schema';

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;

/**
 * DB executor: root client or an open transaction. The set-default operation is
 * two writes that must be one decision, so it takes a `tx`; the single-statement
 * reads and the soft delete take the root client and do not.
 */
export type DbExecutor = Database;

/**
 * Every statement here is keyed on the CALLER's id, taken from the token
 * subject and never from a body, a query parameter or a path segment.
 *
 * That is the whole authorisation story of this repository, and on this table it
 * matters more than anywhere else in the API. The API connects as the
 * `postgres` pooler role — the owner of `public.payment_methods`, and therefore
 * EXEMPT FROM RLS — so the `user_id = $1` predicate in each query IS the access
 * control. There is no policy behind it to lean on: the single
 * `Users manage own payment methods` policy constrains PostgREST, not the
 * service_role connection this repository uses. A predicate that trusted a
 * `user_id` from the request would be a cross-account read of someone's card
 * metadata, which is why `userId` is an argument of every method below and
 * never a field of a payload.
 */
@Injectable()
export class PaymentMethodsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client: the
   * one-default rule is a read followed by two writes, and only the same
   * transaction makes them one decision.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * The caller's usable cards, default first and newest after.
   *
   * `userId` is a REQUIRED argument rather than a filter this class can be asked
   * to skip: there is no "list any wallet" query here on purpose, so reading
   * someone else's is not a reachable code path.
   *
   * The two visibility predicates are the contract the consumer already had from
   * PostgREST — `profileRepository.getPaymentMethods` filters
   * `.is('deleted_at', null)` AND `.eq('active', true)` — and they are BOTH
   * needed, because the two columns are not redundant: `deleted_at` records when
   * a card was removed, while `active` is the instrument-level switch a gateway
   * integration would flip when a card stops being chargeable without the user
   * deleting it. A row with `active = false` and no `deleted_at` is a normal,
   * reachable state and must not surface.
   *
   * The ordering is the consumer's own (`is_default desc, created_at desc`),
   * kept so the cutover does not reorder the wallet under the user.
   */
  async listUsableForUser(userId: string): Promise<PaymentMethodRow[]> {
    return this.db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.user_id, userId),
          isNull(paymentMethods.deleted_at),
          eq(paymentMethods.active, true),
        ),
      )
      .orderBy(
        desc(paymentMethods.is_default),
        desc(paymentMethods.created_at),
      );
  }

  /**
   * Serialize every set-default for one user, for the rest of the transaction.
   *
   * WHY THIS EXISTS AT ALL, and why it is a lock rather than a `SELECT … FOR
   * UPDATE` on the rows: the one-default rule is TWO writes with a window
   * between them, and the rows do not protect it. Under READ COMMITTED two
   * concurrent promotions can interleave as
   *
   *     T1: clear all defaults   (except A)
   *     T2: clear all defaults   (except B)
   *     T1: set A default         ← locks row A only
   *     T2: set B default         ← locks row B only, no conflict
   *
   * and commit with A and B both default. Row locks cannot help: the two SETs
   * touch different rows, so they never block each other. A `FOR UPDATE` over the
   * user's existing rows would serialise the two transactions, but it locks
   * NOTHING for a user whose first card is being promoted, and it is the
   * application's own invariant — the very thing a lock on a key derived from
   * `(user_id, is_default)` would be pretending to protect. A per-user advisory
   * lock is the one mechanism that covers the whole window, including the
   * zero-rows case, and it is the idiom this API already uses:
   * `OrdersRepository.lockIdempotencyKey` takes the same
   * `pg_advisory_xact_lock(hashtextextended(...))` for the same reason.
   *
   * TWO DETAILS ARE LOAD-BEARING AND MUST NOT BE "CLEANED UP":
   *
   *  1. It is `pg_advisory_xact_lock`, so it is taken on the transaction's
   *     connection and released at commit or rollback. A session lock would leak
   *     into the pooled connection and serialise unrelated users; a lock taken
   *     OUTSIDE the transaction would leave the clear-then-set window open,
   *     which is the exact race the lock exists to close.
   *  2. The key is namespaced `'payment_methods_default:' || user_id` rather
   *     than the bare user id. The orders lock hashes `user_id || ':' || key`
   *     with a CLIENT-SUPPLIED idempotency key, so a bare user id could collide
   *     with a reservation whose key happened to be shaped like this namespace.
   *     `hashtextextended` is computed by the DATABASE, not in JavaScript, for
   *     the same reason it is there in orders: two producers that hash
   *     differently would stop excluding each other while still behaving alike
   *     in tests that never run them against one database.
   *
   * WHAT THE LOCK DOES NOT PROMISE, because a spec once asserted it: it
   * serialises the transactions, it does NOT make the last-REQUESTED card win.
   * Concurrent promotions resolve in the order they acquire the lock, which is
   * not the order they were called in, so "last writer wins" is not a property of
   * this implementation and asserting it produced a test that failed on about
   * one run in four. The guarantee is the invariant — at most one default, always
   * — and never which of the concurrent callers owns it.
   */
  async lockDefaultForUser(tx: DbExecutor, userId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('payment_methods_default:' || ${userId}::text, 0))`,
    );
  }

  /**
   * One of the caller's cards, by id, and only if it is still usable.
   *
   * The `deleted_at is null AND active` predicates are part of the ANSWER, not
   * just an optimisation: a card that was soft-deleted must answer 404 to
   * set-default, exactly as it answers 404 to a second delete, or a client could
   * promote a card the user has already removed. "Not yours", "not there" and
   * "removed" are deliberately the same answer from outside.
   */
  async findOwnedUsable(
    executor: DbExecutor,
    userId: string,
    id: string,
  ): Promise<PaymentMethodRow | null> {
    const [row] = await executor
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.user_id, userId),
          eq(paymentMethods.id, id),
          isNull(paymentMethods.deleted_at),
          eq(paymentMethods.active, true),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * One of the caller's rows by id, WHETHER OR NOT IT IS STILL USABLE.
   *
   * The difference from `findOwnedUsable` is the whole point of this method, and
   * it exists for `DELETE`: a second delete of a card the caller already removed
   * must still answer "yes, it is gone" (204), while a card that was never the
   * caller's must answer 404. A read that filtered on `active` / `deleted_at`
   * could not tell those two apart — it would report both as absent.
   *
   * It is the AUTHORISATION read for the delete, and the write that follows is
   * still scoped by `user_id` rather than trusting this result, so a race here
   * can only cost a 404, never a write outside the caller's wallet.
   */
  async findOwnedAny(
    userId: string,
    id: string,
  ): Promise<PaymentMethodRow | null> {
    const [row] = await this.db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.user_id, userId), eq(paymentMethods.id, id)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Clear the caller's default flag everywhere except `exceptId`.
   *
   * THIS IS HALF OF THE ONE-DEFAULT RULE, and the database enforces none of it:
   * `payment_methods` has a primary key, a foreign key, two CHECKs and a
   * NON-UNIQUE index on `(user_id)`. There is no unique constraint and no partial
   * unique index on `is_default`, so a second default row is perfectly writable
   * in plain SQL today, through PostgREST included.
   *
   * Narrowed to `is_default = true` on purpose: a wider update would bump
   * `updated_at` on rows that did not change. `exceptId` is applied only when
   * there is one, because `ne(column, null)` in SQL is `!= null`, which is true
   * for every row and would clear the very row being promoted.
   *
   * Deleted and inactive rows are included in the sweep, and that is not an
   * oversight: a card that is soft-deleted can still carry `is_default = true`
   * (nothing clears it on delete, and inventing a replacement default during a
   * delete would move the user's default under them), so leaving it alone could
   * make it the only row with the flag while being invisible in every list.
   *
   * Returns how many rows it touched, so the caller can tell "there was a
   * previous default" from "there was nothing to move".
   */
  async clearOtherDefaults(
    executor: DbExecutor,
    userId: string,
    exceptId: string | null,
  ): Promise<number> {
    const scope = [
      eq(paymentMethods.user_id, userId),
      eq(paymentMethods.is_default, true),
      ...(exceptId ? [ne(paymentMethods.id, exceptId)] : []),
    ];

    const cleared = await executor
      .update(paymentMethods)
      .set({ is_default: false, updated_at: new Date() })
      .where(and(...scope))
      .returning({ id: paymentMethods.id });

    return cleared.length;
  }

  /**
   * Mark one owned card as the default.
   *
   * The `user_id` predicate is in the WHERE, not only in the caller's head: a
   * promotion aimed at someone else's id updates zero rows and the service
   * answers 404, so nothing outside the caller is ever written — not even the
   * clear that precedes it, which is why the ownership read happens first.
   *
   * `updated_at` is written explicitly because NO trigger maintains it on this
   * table (verified against the live database, not assumed — see the mirror note
   * in `database/schema/payment-methods.ts`), which is the same reason every
   * other repository in this API sets it by hand.
   */
  async setDefaultOwned(
    executor: DbExecutor,
    userId: string,
    id: string,
  ): Promise<PaymentMethodRow | null> {
    const [row] = await executor
      .update(paymentMethods)
      .set({ is_default: true, updated_at: new Date() })
      .where(and(eq(paymentMethods.user_id, userId), eq(paymentMethods.id, id)))
      .returning();

    return row ?? null;
  }

  /**
   * SOFT delete one owned row: `active = false` and `deleted_at = now()`.
   *
   * A soft delete, not a `DELETE`, and the column is the reason: `deleted_at`
   * exists on this table precisely so a removed card is retained. It is also what
   * the consumer already does —
   * `profileRepository.deletePaymentMethod` issues
   * `update { active: false, deleted_at: now }` — so this is a cutover, not a
   * change of meaning, and a hard delete here would make the two writers
   * disagree about what the same user action does.
   *
   * BOTH columns move, and they are not redundant: `active` is the instrument
   * switch a gateway integration flips when a card stops being chargeable, while
   * `deleted_at` records the user's own removal. Writing only one of them would
   * leave a row the other predicate still reports.
   *
   * `is_default` is deliberately NOT cleared, and no replacement is promoted.
   * That is the same decision `SavedAddressesService.remove` makes and for the
   * same reason: "I no longer have a default" is a statement a user can make
   * about their own wallet, and inventing a replacement during a delete would
   * silently move their default under them. The stale flag is harmless on its
   * own — the row is invisible in every list — and the next set-default sweep
   * clears it.
   *
   * The `user_id` predicate is in the WHERE: a caller can only ever soft-delete
   * their own card. Returns whether a row was actually changed, so a second
   * delete reports success rather than a 404.
   */
  async softDeleteOwned(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .update(paymentMethods)
      .set({ active: false, deleted_at: new Date(), updated_at: new Date() })
      .where(and(eq(paymentMethods.user_id, userId), eq(paymentMethods.id, id)))
      .returning({ id: paymentMethods.id });

    return rows.length > 0;
  }
}
