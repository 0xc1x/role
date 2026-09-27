import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type AddFavoriteRequestDto,
  type FavoriteDto,
  type FavoritePaginatedData,
  type ListFavoritesQuery,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { OfferMapper } from '../offers/offers.mapper';
import { OffersRepository } from '../offers/offers.repository';
import { FavoriteMapper } from './favorites.mapper';
import { FavoritesRepository } from './favorites.repository';

/**
 * Favorites of the AUTHENTICATED caller.
 *
 * Every method takes the `AuthUser` and reads the owner from `user.id`. There is
 * no `user_id` parameter anywhere in this service, which is the whole point: a
 * favorite list is private to its owner, so the identity has to come from the
 * verified token and there must be no code path that could accept it from the
 * request instead. The repository is equally scoped — it only has
 * `listForUser` / `deleteByOfferId`, both keyed by that id.
 *
 * These are consumer endpoints, not an admin or business surface: any
 * authenticated role may use them, so the controller declares no `@Roles`.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly favoritesRepository: FavoritesRepository,
    private readonly offersRepository: OffersRepository,
  ) {}

  async list(
    user: AuthUser,
    query: ListFavoritesQuery,
  ): Promise<FavoritePaginatedData> {
    const { rows, total } = await this.favoritesRepository.listForUser(
      user.id,
      { page: query.page, limit: query.limit },
    );

    // Offers are fetched by id and re-keyed, so the favorite ordering from the
    // first query survives. Availability is NOT filtered here: a saved offer
    // that is sold out or past its window is still a saved offer, and dropping
    // it would make the user's own list lose rows.
    const offerRows = await this.offersRepository.findManyByIds(
      rows.map((row) => row.offer_id),
    );
    const offersById = new Map(
      offerRows.map((row) => [row.id, OfferMapper.toResponse(row)]),
    );

    return paginatedDataFromQuery(
      rows.map((row) =>
        FavoriteMapper.toListItem(row, offersById.get(row.offer_id) ?? null),
      ),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Idempotent add: favouriting an offer that is already a favorite returns the
   * existing row instead of failing on the unique violation.
   */
  async add(user: AuthUser, body: AddFavoriteRequestDto): Promise<FavoriteDto> {
    // Existence check before the insert. The foreign key would reject a
    // non-existent offer anyway, but as a raw constraint violation; a 404 is
    // the answer the caller can act on.
    const [offer] = await this.offersRepository.findManyByIds([body.offer_id]);
    if (!offer) {
      throw new NotFoundException(`Offer ${body.offer_id} not found`);
    }

    const row = await this.favoritesRepository.insertIfAbsent(
      user.id,
      body.offer_id,
    );
    // Defensive: with the offer proven to exist, a null here means the
    // conflicting row disappeared between the insert and the re-read. The
    // caller can only act on it by retrying, which is what a 404 invites.
    if (!row) {
      throw new NotFoundException(`Offer ${body.offer_id} not found`);
    }

    return FavoriteMapper.toDto(row);
  }

  /**
   * Remove by offer id, scoped to the caller. Deleting something that is not
   * there is a success, not a 404: the Supabase-side behaviour this mirrors
   * deletes zero rows and reports success, and a toggle in a consumer that
   * double-fires should not have to distinguish the two cases.
   */
  async remove(user: AuthUser, offerId: string): Promise<void> {
    await this.favoritesRepository.deleteByOfferId(user.id, offerId);
  }
}
