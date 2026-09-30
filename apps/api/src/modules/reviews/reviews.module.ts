import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { OffersModule } from '../offers/offers.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsFeedsController } from './reviews-feeds.controller';
import { ReviewsFeedsService } from './reviews-feeds.service';
import { ReviewsModerationController } from './reviews-moderation.controller';
import { ReviewsModerationService } from './reviews-moderation.service';
import { ReviewsFeedRepository } from './reviews-feed.repository';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

/**
 * `BusinessesModule` and `OffersModule` are imported for their repositories
 * only, and only the read feeds need them: the public feeds ask those modules
 * for the same availability gate the public catalog uses instead of restating
 * it. Both modules export the repository and neither imports this one, so the
 * graph stays acyclic — `ReviewsModule` is imported by nothing.
 */
@Module({
  imports: [BusinessesModule, OffersModule],
  controllers: [
    ReviewsController,
    ReviewsFeedsController,
    ReviewsModerationController,
  ],
  providers: [
    ReviewsService,
    ReviewsModerationService,
    ReviewsFeedsService,
    ReviewsRepository,
    ReviewsFeedRepository,
  ],
})
export class ReviewsModule {}
