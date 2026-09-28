import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateOfferSchema,
  ListOffersQuerySchema,
  ListZonesQuerySchema,
  UpdateOfferSchema,
} from '@0xc1x/role-commons';
import type {
  CreateOfferDto,
  ListOffersQuery,
  ListZonesQuery,
  OfferDto,
  OfferWithBusiness,
  PopularZoneDto,
  UpdateOfferDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OffersService } from './offers.service';

@ApiTags('Offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List available surplus food offers' })
  @ApiOkResponse({ description: 'Paginated offer list' })
  list(
    @Query(new ZodValidationPipe(ListOffersQuerySchema))
    query: ListOffersQuery,
  ) {
    return this.offersService.list(query);
  }

  @Public()
  @Get('random')
  @ApiOperation({ summary: 'Random active offer (landing hero)' })
  @ApiOkResponse({ description: 'Offer with business and location, or null' })
  getRandom(): Promise<OfferWithBusiness | null> {
    return this.offersService.getRandom();
  }

  /**
   * `GET /offers/zones` — mirror of `public.popular_zones` (ADR-0008).
   *
   * WHY IT LIVES ON OFFERS AND NOT ON BUSINESSES: the rows it returns are
   * `business_locations.zone` labels, so `businesses` looks like the natural
   * home — but every column it projects is an OFFER aggregate (`count(*)` over
   * reservable offers). A route on `businesses` would have to import the offers
   * repository to answer a question about offers, and the client that needs it
   * (the Explore screen) already fetches offers to know which zone is worth
   * tapping. `businesses` keeps answering "which merchants are public"; this
   * answers "how much is on the shelf over there". One projection, one module,
   * no new module for a single read.
   *
   * Declared BEFORE `@Get(':id')` because Nest matches routes in declaration
   * order and `:id` is `ParseUUIDPipe`d — without this, `zones` would be read as
   * an id and 400. Same reason `random` sits above it.
   */
  @Public()
  @Get('zones')
  @ApiOperation({ summary: 'Popular zones by live offers (Explore chips)' })
  @ApiOkResponse({
    description:
      'Zones with their reservable-offer counts, most deals first then zone name',
  })
  listZones(
    @Query(new ZodValidationPipe(ListZonesQuerySchema)) query: ListZonesQuery,
  ): Promise<PopularZoneDto[]> {
    return this.offersService.listZones(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get offer detail' })
  @ApiOkResponse({ description: 'Offer detail with business and location' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.offersService.getById(id);
  }

  @Post()
  @Roles('admin', 'business')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create an offer (admin or business owner)' })
  @ApiCreatedResponse({ description: 'Offer created' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateOfferSchema))
    body: CreateOfferDto,
  ): Promise<OfferDto> {
    return this.offersService.create(user, body);
  }

  @Patch(':id')
  @Roles('admin', 'business')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update an offer (admin or business owner)' })
  @ApiOkResponse({ description: 'Offer updated' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOfferSchema))
    body: UpdateOfferDto,
  ): Promise<OfferDto> {
    return this.offersService.update(user, id, body);
  }

  @Delete(':id')
  @Roles('admin', 'business')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Deactivate an offer (admin or business owner)' })
  @ApiOkResponse({ description: 'Offer deactivated' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.offersService.remove(user, id);
  }
}
