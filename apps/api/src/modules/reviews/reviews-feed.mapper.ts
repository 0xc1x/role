import type {
  MyReviewItemDto,
  OfferReviewItemDto,
  PublicReviewItemDto,
} from '@0xc1x/role-commons';
import type {
  OfferReviewFeedRow,
  ReviewFeedRow,
} from './reviews-feed.repository';

/**
 * Maps feed rows → the three feed DTOs.
 *
 * Each mapper builds its object as a literal, which is the mechanism that keeps
 * the feeds narrow: there is no spread of the row, so a column added to
 * `reviews` or to `profiles` cannot reach a response by being forgotten in a
 * destructuring list. `author_name` is the only thing that comes off `profiles`,
 * and it is `null` when the profile is gone.
 */
export class ReviewFeedMapper {
  static toPublicDto(row: ReviewFeedRow): PublicReviewItemDto {
    return {
      id: row.id,
      business_id: row.business_id,
      order_id: row.order_id,
      product_rating: row.product_rating,
      business_rating: row.business_rating,
      comment: row.comment,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      author_id: row.author_id,
      author_name: row.author_name,
    };
  }

  static toOfferDto(row: OfferReviewFeedRow): OfferReviewItemDto {
    return {
      ...ReviewFeedMapper.toPublicDto(row),
      offer_id: row.offer_id,
      offer_title: row.offer_title,
    };
  }

  /**
   * The caller's own row. The only difference from the public mapper is
   * `is_hidden`: this is the one reader for whom "this was withheld" is their own
   * business. `moderation_reason` and `hidden_reason` stay behind — that record
   * is the appeal between the business and the platform, not the author's.
   */
  static toMyDto(row: ReviewFeedRow): MyReviewItemDto {
    return {
      ...ReviewFeedMapper.toPublicDto(row),
      is_hidden: row.is_hidden,
    };
  }
}
