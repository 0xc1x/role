import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { ReviewsService } from './reviews.service';

const CreateReviewRequestSchema = z.object({
  order_id: z.string().uuid(),
  comment: z.string().max(2000).nullable().optional(),
  product_rating: z.number().int().min(1).max(5).nullable().optional(),
  business_rating: z.number().int().min(1).max(5).nullable().optional(),
});

@ApiTags('Reviews')
@ApiBearerAuth('bearer')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a review for a completed order' })
  @ApiCreatedResponse({ description: 'Review created' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateReviewRequestSchema))
    body: {
      order_id: string;
      comment?: string | null;
      product_rating?: number | null;
      business_rating?: number | null;
    },
  ) {
    return this.reviewsService.create(user, body);
  }
}
