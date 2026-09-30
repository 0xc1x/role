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
  ApiUnprocessableEntityResponse,
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
  UpdateBusinessNotificationPreferencesSchema,
} from '@0xc1x/role-commons';
import type {
  CreateBusinessDto,
  UpdateBusinessDto,
  ListBusinessesQuery,
  CreateBusinessLocationDto,
  UpdateBusinessLocationDto,
  ListBusinessLocationsQuery,
  OnboardingBusinessRequest,
  UpdateBusinessNotificationPreferencesDto,
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
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate business' })
  @ApiOkResponse({ description: 'Business deactivated' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businessesService.remove(user, id);
  }

  @Get(':id/email-sends')
  @Roles('admin')
  @ApiOperation({
    summary: 'List transactional email deliveries for a business',
  })
  @ApiOkResponse({ description: 'Transactional email deliveries' })
  listEmailSends(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businessesService.listEmailSends(user, id);
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

  // Notification preferences
  //
  // THE BUSINESS-SIDE COUNTERPART of `GET/PATCH /me/notification-preferences`,
  // which already serves `consumer_notification_preferences` for the person.
  // Same feature, other side of the marketplace, one row per owner — so this is
  // a different TABLE and a different route, and it is emphatically not a second
  // consumer route for the consumer table.
  //
  // The path segment is `:businessId`, as it is for `:businessId/locations`, and
  // it is a CLAIM, not an identity: `BusinessesService` resolves it against
  // `business_ownership` before the repository is reached. `@Roles('business',
  // 'admin')` is the coarse pre-filter every per-business route here carries; the
  // ownership check is the real gate and it lives in the service, where a role
  // check alone would be trivially bypassed by any account that owns a business.

  @Get(':businessId/notification-preferences')
  @Roles('business', 'admin')
  @ApiOperation({
    summary: "The business's own notification preferences (merchant side)",
  })
  @ApiOkResponse({
    description:
      'The preferences row, or an explicit null when the business has none',
  })
  getNotificationPreferences(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.businessesService.getNotificationPreferences(user, businessId);
  }

  @Patch(':businessId/notification-preferences')
  @Roles('business', 'admin')
  @ApiOperation({
    summary:
      "Edit the business's notification preferences. `updated_at` is written by the server; no trigger maintains it.",
  })
  @ApiOkResponse({ description: 'The preferences row in its new state' })
  @ApiUnprocessableEntityResponse({
    description: 'A half-configured quiet-hours window',
  })
  updateNotificationPreferences(
    @CurrentUser() user: AuthUser,
    // `business_id`, `created_at` and `updated_at` are not keys of this schema,
    // so the pipe strips them: the business is the path, and the timestamps are
    // the server's to write.
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body(new ZodValidationPipe(UpdateBusinessNotificationPreferencesSchema))
    body: UpdateBusinessNotificationPreferencesDto,
  ) {
    return this.businessesService.updateNotificationPreferences(
      user,
      businessId,
      body,
    );
  }
}
