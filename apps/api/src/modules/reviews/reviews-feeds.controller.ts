import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListReviewsFeedQuerySchema,
  type ListReviewsFeedQuery,
  type MyReviewPaginatedData,
  type OfferReviewPaginatedData,
  type PublicReviewPaginatedData,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReviewsFeedsService } from './reviews-feeds.service';

/**
 * Read feeds over reviews. One controller, no prefix, three explicit paths.
 *
 * WHY NO PREFIX: the three feeds hang off three different resources —
 * `businesses/public/{id}`, `offers/{id}` and the caller's own history — and
 * mounting each in the controller that owns its resource would mean
 * `BusinessesModule` importing `ReviewsModule` (or the reverse) purely to get a
 * path. Writing the full paths here keeps the route table in one readable place
 * and the module graph acyclic.
 *
 * It is also the only arrangement that cannot be shadowed. `OffersController`
 * declares `@Get(':id')` and `BusinessesController` declares `@Get(':id')`; both
 * match one path segment, and neither can ever capture a three-segment path like
 * `offers/{id}/reviews`, so registration order is irrelevant here. Mounting
 * `businesses/public/{id}/reviews` on `BusinessesController` would have put a
 * public route next to the panel routes of the same resource, which is the
 * coupling this avoids.
 *
 * GUARDS: the two public feeds are `@Public()` per handler, the "my" feed is not
 * and therefore requires a token through the default-deny global guard. No
 * `@Roles(...)` anywhere: the "my" feed is a consumer surface, and the public
 * feeds have no roles to check.
 *
 * The `/me` PREFIX for the caller's own data: there is no `/me` route outside
 * `GET /auth/me`, and the alternative in this codebase is the implicit one
 * (`GET /favorites` means "my favorites"). `/me` is chosen because the resource
 * really is the caller's own collection and the path says so out loud; a bare
 * `GET /reviews` would collide with the `POST /reviews` that writes, and
 * `GET /reviews` meaning "mine" is exactly the kind of asymmetry that gets
 * misread as "everybody's".
 */
@ApiTags('Reviews')
@Controller()
export class ReviewsFeedsController {
  constructor(private readonly feeds: ReviewsFeedsService) {}

  @Public()
  @Get('businesses/public/:businessId/reviews')
  @ApiOperation({
    summary: 'Public review feed of a business (visible reviews only)',
  })
  @ApiOkResponse({ description: 'Paginated reviews of a public business' })
  listBusinessReviews(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query(new ZodValidationPipe(ListReviewsFeedQuerySchema))
    query: ListReviewsFeedQuery,
  ): Promise<PublicReviewPaginatedData> {
    return this.feeds.listBusinessReviews(businessId, query);
  }

  @Public()
  @Get('offers/:id/reviews')
  @ApiOperation({ summary: 'Public review feed of an offer (visible only)' })
  @ApiOkResponse({ description: 'Paginated reviews of a public offer' })
  listOfferReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListReviewsFeedQuerySchema))
    query: ListReviewsFeedQuery,
  ): Promise<OfferReviewPaginatedData> {
    return this.feeds.listOfferReviews(id, query);
  }

  @Get('me/reviews')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'My review history, including reviews hidden from the public',
  })
  @ApiOkResponse({ description: 'Paginated reviews written by the caller' })
  listMyReviews(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListReviewsFeedQuerySchema))
    query: ListReviewsFeedQuery,
  ): Promise<MyReviewPaginatedData> {
    return this.feeds.listMyReviews(user, query);
  }
}
