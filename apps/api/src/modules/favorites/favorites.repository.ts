import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { favorites } from '../../database/schema';

/** Row as stored in Postgres (Date timestamps). */
export type FavoriteRow = typeof favorites.$inferSelect;

export type ListFavoritesFilter = {
  page: number;
  limit: number;
};

export type ListFavoritesResult = {
  rows: FavoriteRow[];
  total: number;
};

@Injectable()
export class FavoritesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The caller's own favorites, newest first. `userId` is a REQUIRED argument
   * rather than a filter this class can be asked to skip: there is no "list all
   * favorites" query here on purpose, so reading someone else's list is not a
   * reachable code path.
   */
  async listForUser(
    userId: string,
    filter: ListFavoritesFilter,
  ): Promise<ListFavoritesResult> {
    const where = eq(favorites.user_id, userId);
    const offset = (filter.page - 1) * filter.limit;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select()
        .from(favorites)
        .where(where)
        .orderBy(desc(favorites.created_at))
        .limit(filter.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(favorites)
        .where(where)
        .then((result) => result[0]?.value ?? 0),
    ]);

    return { rows, total: Number(totalRow) };
  }

  /**
   * Insert, or return the row that is already there.
   *
   * Idempotent by the same `on conflict ... do nothing` the trigger-style
   * writers in this repo use (`UserDefaultsService`): the live unique index
   * `favorites_user_id_offer_id_key` is the conflict target, so favouriting the
   * same offer twice is a no-op insert instead of a 23505 the caller would have
   * to treat as success. `returning()` yields nothing on the conflict path, so
   * the existing row is re-read to answer with the real row either way.
   *
   * Returns `null` only when the offer does not exist (FK violation), which the
   * service turns into a 404 instead of letting a constraint error surface.
   */
  async insertIfAbsent(
    userId: string,
    offerId: string,
  ): Promise<FavoriteRow | null> {
    const [inserted] = await this.db
      .insert(favorites)
      .values({ user_id: userId, offer_id: offerId })
      .onConflictDoNothing({ target: [favorites.user_id, favorites.offer_id] })
      .returning();

    if (inserted) return inserted;

    const [existing] = await this.db
      .select()
      .from(favorites)
      .where(
        and(eq(favorites.user_id, userId), eq(favorites.offer_id, offerId)),
      )
      .limit(1);

    return existing ?? null;
  }

  /**
   * Remove one of the caller's favorites by offer id. Scoped by `userId` in the
   * WHERE, so a caller can only ever delete their own row.
   */
  async deleteByOfferId(userId: string, offerId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(favorites)
      .where(
        and(eq(favorites.user_id, userId), eq(favorites.offer_id, offerId)),
      )
      .returning({ id: favorites.id });

    return deleted.length > 0;
  }
}
