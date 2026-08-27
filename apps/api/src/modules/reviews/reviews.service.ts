import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '../../database/database.module';
import type { AuthUser } from '../../auth/auth.types';
import { ReviewsRepository, type ReviewRow } from './reviews.repository';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  async create(
    user: AuthUser,
    input: {
      order_id: string;
      comment?: string | null;
      product_rating?: number | null;
      business_rating?: number | null;
    },
  ): Promise<ReviewRow> {
    return this.reviewsRepository.transaction(async (tx) => {
      const order = await this.reviewsRepository.findOrderById(
        tx,
        input.order_id,
      );
      if (!order) {
        throw new NotFoundException(`Order ${input.order_id} not found`);
      }
      if (order.user_id !== user.id) {
        throw new ForbiddenException('You can only review your own orders');
      }

      const review = await this.reviewsRepository.insert(tx, {
        user_id: user.id,
        business_id: order.business_id,
        order_id: order.id,
        product_rating: input.product_rating ?? null,
        business_rating: input.business_rating ?? null,
        comment: input.comment ?? null,
      });

      // Espejo de los triggers de rating (idempotente: recalcula promedios).
      await this.recalcRatings(tx, order.business_id, order.offer_id);

      return review;
    });
  }

  /** Espejo de los triggers `update_business_rating` / `update_offer_rating`. */
  async recalculateRatings(
    businessId?: string,
    offerId?: string,
  ): Promise<void> {
    await this.reviewsRepository.transaction(async (tx) => {
      await this.recalcRatings(tx, businessId, offerId);
    });
  }

  private async recalcRatings(
    tx: Database,
    businessId?: string,
    offerId?: string,
  ): Promise<void> {
    if (businessId) {
      await this.reviewsRepository.recalcBusinessRating(tx, businessId);
    }
    if (offerId) {
      await this.reviewsRepository.recalcOfferRating(tx, offerId);
    }
  }
}
