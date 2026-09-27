import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type ListReviewsFeedQuery,
  type MyReviewPaginatedData,
  type OfferReviewPaginatedData,
  type PublicReviewPaginatedData,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessesRepository } from '../businesses/businesses.repository';
import { OffersRepository } from '../offers/offers.repository';
import { ReviewFeedMapper } from './reviews-feed.mapper';
import { ReviewsFeedRepository } from './reviews-feed.repository';

/**
 * The three read feeds over reviews: one business, one offer, and the caller's
 * own history.
 *
 * Two of them are public and one is not, and the difference is not "public vs
 * authenticated": it is WHICH business or offer may be narrated. Both public
 * feeds ask the owner-facing repositories for the same gate the rest of the
 * public surface uses — `BusinessesRepository.findPublicById` for a business,
 * `OffersRepository.isPubliclyAvailable` for an offer — instead of restating it
 * here. A feed that re-derived "is this business public?" would be a fourth copy
 * of the predicate, and the copy is where a still-pending business becomes
 * readable.
 */
@Injectable()
export class ReviewsFeedsService {
  constructor(
    private readonly reviewsFeedRepository: ReviewsFeedRepository,
    private readonly businessesRepository: BusinessesRepository,
    private readonly offersRepository: OffersRepository,
  ) {}

  /**
   * 404 for a business that is unknown, deactivated or not approved. Same answer
   * for all three, because a 403 would tell a stranger that the id they asked
   * for exists.
   */
  async listBusinessReviews(
    businessId: string,
    query: ListReviewsFeedQuery,
  ): Promise<PublicReviewPaginatedData> {
    const business = await this.businessesRepository.findPublicById(businessId);
    if (!business) {
      throw new NotFoundException(`Business ${businessId} not found`);
    }

    const { rows, total } =
      await this.reviewsFeedRepository.listVisibleByBusiness(businessId, query);
    return paginatedDataFromQuery(
      rows.map((row) => ReviewFeedMapper.toPublicDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Same 404 rule for an offer, resolved through the offer's own availability
   * gate. The reviews of an offer that exists but cannot be reserved are not a
   * public fact yet.
   */
  async listOfferReviews(
    offerId: string,
    query: ListReviewsFeedQuery,
  ): Promise<OfferReviewPaginatedData> {
    if (!(await this.offersRepository.isPubliclyAvailable(offerId))) {
      throw new NotFoundException(`Offer ${offerId} not found`);
    }

    const { rows, total } = await this.reviewsFeedRepository.listVisibleByOffer(
      offerId,
      query,
    );
    return paginatedDataFromQuery(
      rows.map((row) => ReviewFeedMapper.toOfferDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * The caller's own history, hidden rows included.
   *
   * There is no gate and no filter beyond `user_id = caller`: this is the
   * author's own data, and the row is reachable through the token subject only —
   * no id, no query parameter and no role can widen it, so there is nothing for a
   * caller to get wrong here.
   */
  async listMyReviews(
    user: AuthUser,
    query: ListReviewsFeedQuery,
  ): Promise<MyReviewPaginatedData> {
    const { rows, total } = await this.reviewsFeedRepository.listForUser(
      user.id,
      query,
    );
    return paginatedDataFromQuery(
      rows.map((row) => ReviewFeedMapper.toMyDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }
}
