import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListPublicBusinessesQuerySchema,
  type ListPublicBusinessesQuery,
  type PublicBusinessPaginatedData,
  type PublicBusinessStorefrontDto,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BusinessesPublicService } from './businesses-public.service';

/**
 * Public business surface, mounted on its own prefix.
 *
 * WHY A SECOND CONTROLLER AND NOT `@Get('public')` ON `BusinessesController`:
 * `BusinessesController` declares `@Get(':id')`, and that route matches
 * `/businesses/public`. Whichever of the two registers first wins, so this
 * controller has to be listed BEFORE the panel one in `BusinessesModule` — see
 * the order note there. Inside a single controller the equivalent would be
 * declaring the public handlers above `@Get(':id')`, which is what
 * `CategoriesController` does with `admin`; a separate controller was chosen
 * because the panel class carries `@ApiBearerAuth('bearer')` and these two routes
 * are anonymous, and because the public surface should not live inside the panel
 * API it deliberately is not part of.
 *
 * `@Public()` per handler and not at class level, matching
 * `BusinessesController.onboard`. No `@Roles(...)` anywhere: the role guard is
 * allowlist-shaped, so a public route is the absence of roles, and there is no
 * per-role distinction to make — everybody who is not the owner gets the same
 * public view.
 */
@ApiTags('Businesses')
@Controller('businesses/public')
export class BusinessesPublicController {
  constructor(private readonly businessesPublic: BusinessesPublicService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List active, moderation-approved businesses (public catalog)',
  })
  @ApiOkResponse({ description: 'Paginated public businesses' })
  list(
    @Query(new ZodValidationPipe(ListPublicBusinessesQuerySchema))
    query: ListPublicBusinessesQuery,
  ): Promise<PublicBusinessPaginatedData> {
    return this.businessesPublic.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary:
      'Get a business storefront: the business plus its active locations and weekly hours',
  })
  @ApiOkResponse({ description: 'Public business with locations and hours' })
  storefront(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicBusinessStorefrontDto> {
    return this.businessesPublic.storefront(id);
  }
}
