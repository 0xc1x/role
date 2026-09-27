import type {
  FavoriteDto,
  FavoriteWithOfferDto,
  OfferWithBusiness,
} from '@0xc1x/role-commons';
import type { FavoriteRow } from './favorites.repository';

/**
 * Favorites persistence rows → API DTOs.
 *
 * `user_id` crosses the wire in {@link FavoriteMapper.toDto} because it is the
 * caller's own id (the API never resolves a favorite list for anyone else), and
 * it is what a consumer needs to correlate the response with its session.
 */
export class FavoriteMapper {
  static toDto(row: FavoriteRow): FavoriteDto {
    return {
      id: row.id,
      user_id: row.user_id,
      offer_id: row.offer_id,
      created_at: row.created_at.toISOString(),
    };
  }

  /**
   * List entry: the favorite plus the offer projection the caller asked for.
   *
   * `offer` is `null` when the offer row is gone, which is passed through rather
   * than filled with defaults: a fabricated "0 stock, no window" card would be
   * indistinguishable from a real sold-out offer, and the consumer is expected
   * to hide availability it does not have.
   */
  static toListItem(
    row: FavoriteRow,
    offer: OfferWithBusiness | null,
  ): FavoriteWithOfferDto {
    return {
      id: row.id,
      offer_id: row.offer_id,
      created_at: row.created_at.toISOString(),
      offer,
    };
  }
}
