import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AddFavoriteRequestSchema,
  ListFavoritesQuerySchema,
} from '@0xc1x/role-commons';
import type {
  AddFavoriteRequestDto,
  FavoriteDto,
  FavoritePaginatedData,
  ListFavoritesQuery,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { FavoritesService } from './favorites.service';

@ApiTags('Favorites')
@ApiBearerAuth('bearer')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  // No `@Public()` and no `@Roles(...)`: the global AuthGuard is default-deny,
  // so every route here requires a token, and the absent role list is what
  // makes it a consumer surface (any authenticated role) instead of an admin
  // one. The owner is the token subject in all three routes.
  @Get()
  @ApiOperation({ summary: 'List my favorites' })
  @ApiOkResponse({ description: 'Paginated favorites with the offer embedded' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListFavoritesQuerySchema))
    query: ListFavoritesQuery,
  ): Promise<FavoritePaginatedData> {
    return this.favoritesService.list(user, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a favorite (idempotent)' })
  @ApiCreatedResponse({ description: 'Favorite created or already present' })
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AddFavoriteRequestSchema))
    body: AddFavoriteRequestDto,
  ): Promise<FavoriteDto> {
    return this.favoritesService.add(user, body);
  }

  @Delete(':offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one of my favorites by offer id' })
  @ApiNoContentResponse({ description: 'Favorite removed' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<void> {
    return this.favoritesService.remove(user, offerId);
  }
}
