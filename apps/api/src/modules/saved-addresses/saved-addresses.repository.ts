import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { savedAddresses } from '../../database/schema';

/** Row as stored in Postgres (Date timestamps, string numerics). */
export type SavedAddressRow = typeof savedAddresses.$inferSelect;

/** Insert payload for Drizzle. */
export type SavedAddressInsert = typeof savedAddresses.$inferInsert;

/**
 * DB executor: root client or an open transaction.
 * Call sites pass `tx` inside `transaction()` so the read that decides the
 * default flag and the write that sets it share one connection and one
 * snapshot.
 */
export type DbExecutor = Database;

/**
 * The fields a create may set. `id`, `user_id`, `is_default` and both timestamps
 * are out of it on purpose: the identity comes from the token and the flag is
 * decided by the service, so the type itself says a request body cannot reach
 * either of them.
 */
export type SavedAddressCreate = Omit<
  SavedAddressInsert,
  'id' | 'user_id' | 'is_default' | 'created_at' | 'updated_at'
>;

/**
 * Fields a PATCH may set. `is_default` IS among them, because the service is
 * where the request gets authorised and where the previous default is cleared —
 * not because the repository trusts the flag.
 */
export type SavedAddressPatch = Partial<SavedAddressCreate> & {
  is_default?: boolean;
};

@Injectable()
export class SavedAddressesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Run work inside a transaction. Prefer this over exposing the raw client:
   * the one-default rule is a read followed by a write, and only the same
   * transaction makes them one decision.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * The caller's own address book, default first and newest after.
   *
   * `userId` is a REQUIRED argument rather than a filter this class can be
   * asked to skip: there is no "list any address book" query here on purpose, so
   * reading someone else's is not a reachable code path. The ordering is the one
   * the consumer already had from PostgREST (`is_default desc, created_at
   * desc`), kept so the mobile cutover does not reorder the address book under
   * the user.
   */
  async listForUser(userId: string): Promise<SavedAddressRow[]> {
    return this.db
      .select()
      .from(savedAddresses)
      .where(eq(savedAddresses.user_id, userId))
      .orderBy(
        desc(savedAddresses.is_default),
        desc(savedAddresses.created_at),
      );
  }

  /** How many addresses the caller already has. Reads the whole set. */
  async countForUser(executor: DbExecutor, userId: string): Promise<number> {
    const rows = await executor
      .select({ id: savedAddresses.id })
      .from(savedAddresses)
      .where(eq(savedAddresses.user_id, userId));
    return rows.length;
  }

  /**
   * Clear the caller's default flag everywhere except `exceptId`.
   *
   * THIS IS HALF OF THE ONE-DEFAULT RULE, and the database enforces none of it
   * — `saved_addresses` has a primary key and a foreign key and no unique
   * constraint of any kind, so without this statement a second default row is
   * perfectly writable and `dispatch-nearby-offers` would pick one of the two
   * arbitrarily. Narrowed to `is_default = true` on purpose: a wider update would
   * bump `updated_at` on rows that did not change, and `exceptId` is applied
   * only when there is one because `ne(column, null)` in SQL is `!= null`, which
   * is true for every row and would clear the very row being promoted.
   *
   * Returns how many rows it touched, so a caller can tell "there was a previous
   * default" from "there was nothing to move".
   */
  async clearOtherDefaults(
    executor: DbExecutor,
    userId: string,
    exceptId: string | null,
  ): Promise<number> {
    const scope = [
      eq(savedAddresses.user_id, userId),
      eq(savedAddresses.is_default, true),
      ...(exceptId ? [ne(savedAddresses.id, exceptId)] : []),
    ];

    const cleared = await executor
      .update(savedAddresses)
      .set({ is_default: false, updated_at: new Date() })
      .where(and(...scope))
      .returning({ id: savedAddresses.id });

    return cleared.length;
  }

  /** One owned row, by id. The `user_id` predicate is what makes this 404-safe. */
  async findOwned(
    executor: DbExecutor,
    userId: string,
    id: string,
  ): Promise<SavedAddressRow | null> {
    const [row] = await executor
      .select()
      .from(savedAddresses)
      .where(and(eq(savedAddresses.user_id, userId), eq(savedAddresses.id, id)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Insert as `userId`. `user_id` is an argument, not a field of the payload, so
   * there is no value a request body could put here.
   */
  async insertAs(
    executor: DbExecutor,
    userId: string,
    values: SavedAddressCreate & { is_default: boolean },
  ): Promise<SavedAddressRow> {
    const [row] = await executor
      .insert(savedAddresses)
      .values({ ...values, user_id: userId })
      .returning();

    if (!row) throw new Error('Failed to insert saved address');
    return row;
  }

  /**
   * Patch one owned row. The `user_id` predicate is in the WHERE, not only in the
   * caller's head: a patch aimed at someone else's id updates zero rows and the
   * service answers 404, so "not yours" and "not there" are indistinguishable
   * from the outside.
   *
   * `updated_at` is written explicitly because the live `set_saved_addresses_
   * updated_at` trigger is not part of the Drizzle mirror, so nothing else moves
   * it — the same reason every other repository here sets it by hand.
   */
  async updateOwned(
    executor: DbExecutor,
    userId: string,
    id: string,
    patch: SavedAddressPatch,
  ): Promise<SavedAddressRow | null> {
    const [row] = await executor
      .update(savedAddresses)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(savedAddresses.user_id, userId), eq(savedAddresses.id, id)))
      .returning();

    return row ?? null;
  }

  /**
   * Remove one owned row. Scoped by `userId` in the WHERE, so a caller can only
   * ever delete their own address.
   */
  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(savedAddresses)
      .where(and(eq(savedAddresses.user_id, userId), eq(savedAddresses.id, id)))
      .returning({ id: savedAddresses.id });

    return deleted.length > 0;
  }
}
