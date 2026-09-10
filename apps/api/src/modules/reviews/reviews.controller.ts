import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateReviewRequestSchema,
  type CreateReviewRequestDto,
  type ReviewDto,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { ReviewsService } from './reviews.service';

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
    body: CreateReviewRequestDto,
  ): Promise<ReviewDto> {
    return this.reviewsService.create(user, body);
  }
}
