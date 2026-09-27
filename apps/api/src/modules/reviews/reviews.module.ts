import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsModerationController } from './reviews-moderation.controller';
import { ReviewsModerationService } from './reviews-moderation.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, ReviewsModerationController],
  providers: [ReviewsService, ReviewsModerationService, ReviewsRepository],
})
export class ReviewsModule {}
