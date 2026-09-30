import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  HideReviewSchema,
  ListReviewsForModerationQuerySchema,
  type HideReviewDto,
  type ListReviewsForModerationQuery,
  type ReviewModerationItemDto,
  type ReviewModerationPaginatedData,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { ReviewsModerationService } from './reviews-moderation.service';

/**
 * Moderación de reseñas. Sin `@Public()` y con `@Roles('admin')` en la clase
 * (no handler por handler): una ruta nueva que se olvide del decorador sería
 * pública, y esta superficie muestra reseñas ocultas.
 *
 * Prefijo `reviews/moderation` y no `reviews`: `POST /reviews` ya existe en
 * `ReviewsController` y dos controladores repartiendo el mismo prefijo hacen que
 * el orden de registro importe.
 *
 * NO hay `DELETE` en ninguna firma, y no por prudencia de estilo: borrar la fila
 * devolvería el `UNIQUE(user_id, order_id)` al autor, que podría re-publicar la
 * misma reseña en el acto. Moderar es reversible; borrar no lo es.
 */
@ApiTags('Reviews')
@Roles('admin')
@ApiBearerAuth('bearer')
@Controller('reviews/moderation')
export class ReviewsModerationController {
  constructor(private readonly moderation: ReviewsModerationService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews for moderation (admin)' })
  @ApiOkResponse({ description: 'Paginated moderation inbox' })
  list(
    @Query(new ZodValidationPipe(ListReviewsForModerationQuerySchema))
    query: ListReviewsForModerationQuery,
  ): Promise<ReviewModerationPaginatedData> {
    return this.moderation.list(query);
  }

  @Patch(':id/hide')
  @ApiOperation({
    summary:
      'Hide a review with a mandatory reason from the declared taxonomy (admin). Idempotent.',
  })
  @ApiOkResponse({ description: 'Hidden review with its moderation state' })
  hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(HideReviewSchema)) body: HideReviewDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReviewModerationItemDto> {
    return this.moderation.hide(id, body, user.id);
  }

  @Patch(':id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a review (admin). Keeps the recorded reason. Idempotent.',
  })
  @ApiOkResponse({ description: 'Restored review with its moderation state' })
  unhide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ReviewModerationItemDto> {
    return this.moderation.unhide(id, user.id);
  }
}
