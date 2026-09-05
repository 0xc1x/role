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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessesService } from './businesses.service';
import {
  CreateBusinessSchema,
  UpdateBusinessSchema,
  ListBusinessesQuerySchema,
  CreateBusinessLocationSchema,
  UpdateBusinessLocationSchema,
  ListBusinessLocationsQuerySchema,
  OnboardingBusinessRequestSchema,
} from '@0xc1x/role-commons';
import type {
  CreateBusinessDto,
  UpdateBusinessDto,
  ListBusinessesQuery,
  CreateBusinessLocationDto,
  UpdateBusinessLocationDto,
  ListBusinessLocationsQuery,
  OnboardingBusinessRequest,
} from '@0xc1x/role-commons';

@ApiTags('Businesses')
@ApiBearerAuth('bearer')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('onboarding')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Public business onboarding (landing)' })
  @ApiCreatedResponse({ description: 'Onboarding request received' })
  onboard(
    @Body(new ZodValidationPipe(OnboardingBusinessRequestSchema))
    body: OnboardingBusinessRequest,
  ) {
    return this.businessesService.onboard(body);
  }

  @Get()
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'List my businesses' })
  @ApiOkResponse({ description: 'Paginated businesses' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListBusinessesQuerySchema))
    query: ListBusinessesQuery,
  ) {
    return this.businessesService.list(user, query);
  }

  @Post()
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Create a new business' })
  @ApiCreatedResponse({ description: 'Business created' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateBusinessSchema))
    body: CreateBusinessDto,
  ) {
    return this.businessesService.create(user, body);
  }

  @Get(':id')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Get business by id' })
  @ApiOkResponse({ description: 'Business detail' })
  getById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businessesService.getById(user, id);
  }

  @Patch(':id')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Update business' })
  @ApiOkResponse({ description: 'Updated business' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateBusinessSchema))
    body: UpdateBusinessDto,
  ) {
    return this.businessesService.update(user, id, body);
  }

  @Delete(':id')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Deactivate business' })
  @ApiOkResponse({ description: 'Business deactivated' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businessesService.remove(user, id);
  }

  // Business Locations
  @Get(':businessId/locations')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'List locations for a business' })
  @ApiOkResponse({ description: 'Paginated locations' })
  listLocations(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query(new ZodValidationPipe(ListBusinessLocationsQuerySchema))
    query: ListBusinessLocationsQuery,
  ) {
    return this.businessesService.listLocations(user, businessId, query);
  }

  @Get(':businessId/locations/:locationId')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Get location by id' })
  @ApiOkResponse({ description: 'Location detail' })
  getLocation(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.businessesService.getLocation(user, businessId, locationId);
  }

  @Post(':businessId/locations')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Create a new location for a business' })
  @ApiCreatedResponse({ description: 'Location created' })
  createLocation(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body(new ZodValidationPipe(CreateBusinessLocationSchema))
    body: CreateBusinessLocationDto,
  ) {
    return this.businessesService.createLocation(user, businessId, body);
  }

  @Patch(':businessId/locations/:locationId')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Update location' })
  @ApiOkResponse({ description: 'Updated location' })
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body(new ZodValidationPipe(UpdateBusinessLocationSchema))
    body: UpdateBusinessLocationDto,
  ) {
    return this.businessesService.updateLocation(
      user,
      businessId,
      locationId,
      body,
    );
  }

  @Delete(':businessId/locations/:locationId')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'Deactivate location' })
  @ApiOkResponse({ description: 'Location deactivated' })
  removeLocation(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.businessesService.removeLocation(user, businessId, locationId);
  }
}
