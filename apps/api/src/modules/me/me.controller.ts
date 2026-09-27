import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  RegisterMyDeviceSchema,
  RevokeMyDeviceQuerySchema,
  UpdateConsumerNotificationPreferencesSchema,
  UpdateMyPreferencesSchema,
  UpdateMyProfileSchema,
  UpsertMyConsentSchema,
} from '@0xc1x/role-commons';
import type {
  DeviceTokenDto,
  MeAccountDto,
  MeNotificationPreferencesDto,
  MePreferencesDto,
  ProfileDto,
  RegisterMyDeviceDto,
  UpdateMyNotificationPreferencesDto,
  UpdateMyPreferencesDto,
  UpdateMyProfileDto,
  UpsertMyConsentDto,
  UserConsentDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MeService } from './me.service';

/**
 * The caller's own account, under `/me`.
 *
 * WHY `/me` AND NOT THE IMPLICIT COLLECTION: the alternative spelling of this
 * surface is what `favorites` and `addresses` already do — `GET /favorites`
 * means "my favorites" and the path never says so. That works for one thin
 * collection and stops working here, where four resources of four different
 * tables live under the same owner: `GET /preferences` and `GET /consents` are
 * both somebody's, and `GET /profiles` is very much not. `/me` is the prefix
 * `GET /me/reviews` already established (`ReviewsFeedsController`), and it puts
 * the ownership in the path where a reader, a client and a log line can all see
 * it.
 *
 * GUARDS: no `@Public()` and no `@Roles(...)` anywhere. The global `AuthGuard`
 * is default-deny, so every route here needs a token, and the absent role list is
 * what makes this a consumer surface — a `business` account editing its own
 * profile is not an admin action. `@Roles('admin')` on the existing
 * `PATCH /profiles/{id}` stays exactly as it is; this controller does not change
 * or replace it.
 *
 * NOTHING HERE TAKES AN ID. Every handler reads `@CurrentUser()` and every
 * request schema omits the owner column, so no route on this controller can be
 * pointed at another account.
 */
@ApiTags('Me')
@ApiBearerAuth('bearer')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOperation({
    summary: 'My account in one payload (profile, preferences, consents)',
  })
  @ApiOkResponse({
    description: 'Profile and every settings row of the caller',
  })
  getAccount(@CurrentUser() user: AuthUser): Promise<MeAccountDto> {
    return this.me.getAccount(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Edit my profile' })
  @ApiOkResponse({ description: 'Updated profile' })
  @ApiNotFoundResponse({ description: 'No profile for this token subject' })
  @ApiUnprocessableEntityResponse({
    description:
      'The body asked to change `email`, which is the Supabase Auth identity',
  })
  updateProfile(
    @CurrentUser() user: AuthUser,
    // `role` is not a key of this schema, so it cannot reach the write. `email`
    // IS a key and is refused by the service with the path that works.
    @Body(new ZodValidationPipe(UpdateMyProfileSchema))
    body: UpdateMyProfileDto,
  ): Promise<ProfileDto> {
    return this.me.updateProfile(user, body);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My preferences' })
  @ApiOkResponse({
    description:
      'The preferences row, or an explicit null when none was seeded',
  })
  getPreferences(@CurrentUser() user: AuthUser): Promise<MePreferencesDto> {
    return this.me.getPreferences(user);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Edit my preferences' })
  @ApiOkResponse({ description: 'Updated preferences' })
  @ApiUnprocessableEntityResponse({
    description: 'A `favorite_categories` value is outside the active catalog',
  })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateMyPreferencesSchema))
    body: UpdateMyPreferencesDto,
  ): Promise<MePreferencesDto> {
    return this.me.updatePreferences(user, body);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'My notification preferences' })
  @ApiOkResponse({
    description:
      'The notification preferences row, or an explicit null when none was seeded',
  })
  getNotificationPreferences(
    @CurrentUser() user: AuthUser,
  ): Promise<MeNotificationPreferencesDto> {
    return this.me.getNotificationPreferences(user);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Edit my notification preferences' })
  @ApiOkResponse({ description: 'Updated notification preferences' })
  @ApiUnprocessableEntityResponse({
    description: 'A half-configured quiet-hours window',
  })
  updateNotificationPreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateConsumerNotificationPreferencesSchema))
    body: UpdateMyNotificationPreferencesDto,
  ): Promise<MeNotificationPreferencesDto> {
    return this.me.updateNotificationPreferences(user, body);
  }

  @Get('consents')
  @ApiOperation({ summary: 'My consent ledger' })
  @ApiOkResponse({ description: 'Consents of the declared union' })
  listConsents(@CurrentUser() user: AuthUser): Promise<UserConsentDto[]> {
    return this.me.listConsents(user);
  }

  /**
   * PUT, not PATCH: the collection holds one row per DECLARED consent type
   * (`CONSENT_TYPES`), so the body names which one and carries its new state.
   * A PATCH would have to infer the row from a path segment that can only ever
   * be one of three values, which is a PUT with worse ergonomics. Idempotent:
   * repeating the same call returns the same row with the same timestamps.
   */
  @Put('consents')
  @ApiOperation({ summary: 'Grant or revoke one of my consents (idempotent)' })
  @ApiOkResponse({ description: 'The consent row in its new state' })
  putConsent(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpsertMyConsentSchema))
    body: UpsertMyConsentDto,
  ): Promise<UserConsentDto> {
    return this.me.putConsent(user, body);
  }

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a push token for my account (transfers it from another)',
  })
  @ApiCreatedResponse({ description: 'Device registered' })
  registerDevice(
    @CurrentUser() user: AuthUser,
    // `user_id` is not in the schema, so the pipe strips it: a device belongs to
    // the caller, not to whoever the body named.
    @Body(new ZodValidationPipe(RegisterMyDeviceSchema))
    body: RegisterMyDeviceDto,
  ): Promise<DeviceTokenDto> {
    return this.me.registerDevice(user, body);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one of my push tokens, by token' })
  @ApiNoContentResponse({
    description: 'Revoked, or never mine — both are 204',
  })
  revokeDevice(
    @CurrentUser() user: AuthUser,
    // By TOKEN, not by row id: the token is the client's only identity for a
    // push registration, the provider issues it and the row id is internal. It
    // is a query parameter because a push token is an opaque high-entropy
    // string and a path segment would not survive every alphabet a provider
    // might use.
    @Query(new ZodValidationPipe(RevokeMyDeviceQuerySchema))
    query: { token: string },
  ): Promise<void> {
    return this.me.revokeDevice(user, query.token);
  }
}
