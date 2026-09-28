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
  UpdateMyMarketingPreferencesSchema,
  UpdateMyPreferencesSchema,
  UpdateMyProfileSchema,
  UpsertMyConsentSchema,
} from '@0xc1x/role-commons';
import type {
  DeviceTokenDto,
  MeAccountDto,
  MeMarketingPreferencesDto,
  MeNotificationPreferencesDto,
  MePreferencesDto,
  ProfileDto,
  RegisterMyDeviceDto,
  UpdateMyMarketingPreferencesDto,
  UpdateMyNotificationPreferencesDto,
  UpdateMyPreferencesDto,
  UpdateMyProfileDto,
  UpsertMyConsentDto,
  UserConsentDto,
  UserOrderStatsResponseDto,
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
      'The body asked to change `email`, which belongs to `POST /auth/change-email`',
  })
  updateProfile(
    @CurrentUser() user: AuthUser,
    // `role` is not a key of this schema, so it cannot reach the write. `email`
    // IS a key and is refused by the service, which names the route that does it.
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

  /**
   * NOT A SECOND NOTIFICATION PREFERENCES ROUTE. The pairing is worth naming
   * because the three tables are easy to confuse:
   *
   *  - `consumer_notification_preferences` — this controller, below. Channels
   *    and quiet hours for the person.
   *  - `business_notification_preferences` — the MERCHANT-side counterpart, at
   *    `/businesses/:businessId/notification-preferences`. Same flags, other
   *    side of the marketplace.
   *  - `marketing_preferences` — this pair. Not channels at all: it decides
   *    whether CAMPAIGNS (email marketing, push campaigns) may reach the person
   *    and which categories, and it is the only one of the three with a
   *    compliance-visible unsubscribe timestamp.
   *
   * So a reader who finds `marketing_preferences` and assumes
   * `/me/notification-preferences` already covers it is wrong, and a reader who
   * adds a route here for it is adding the second one.
   */
  @Get('marketing-preferences')
  @ApiOperation({
    summary: 'My marketing (campaign) subscription and categories',
  })
  @ApiOkResponse({
    description:
      'The marketing preferences row, or an explicit null when the account has never had one',
  })
  getMarketingPreferences(
    @CurrentUser() user: AuthUser,
  ): Promise<MeMarketingPreferencesDto> {
    return this.me.getMarketingPreferences(user);
  }

  @Patch('marketing-preferences')
  @ApiOperation({
    summary:
      'Edit my marketing subscription or categories. `unsubscribed_at` and `source` are stamped by the server.',
  })
  @ApiOkResponse({
    description:
      'The marketing preferences row in its new state. The unsubscribe timestamp moves only on the transition.',
  })
  updateMarketingPreferences(
    @CurrentUser() user: AuthUser,
    // `user_id`, `unsubscribed_at` and `source` are not keys of this schema, so
    // the pipe strips them: the row belongs to the caller, and the record of
    // when they unsubscribed is the server's to write.
    @Body(new ZodValidationPipe(UpdateMyMarketingPreferencesSchema))
    body: UpdateMyMarketingPreferencesDto,
  ): Promise<MeMarketingPreferencesDto> {
    return this.me.updateMarketingPreferences(user, body);
  }

  /**
   * `GET /me/order-stats` — the consumer aggregate, and it takes NO id.
   *
   * `public.user_order_stats(p_user_id)` takes the caller's id as a parameter,
   * which is safe in Supabase only because it runs under the caller's RLS.
   * There is no RLS in this request path, so the ONLY place a user id could
   * come from here is a query parameter — and a `?user_id=` on a route whose
   * whole sibling set is "the token subject is the owner" is the kind of thing
   * a client fills in from a cached value. There is no parameter to fill in.
   */
  @Get('order-stats')
  @ApiOperation({
    summary:
      'My order count and total saved. Counts every order that is not cancelled.',
  })
  @ApiOkResponse({ description: 'My order aggregate' })
  getOrderStats(
    @CurrentUser() user: AuthUser,
  ): Promise<UserOrderStatsResponseDto> {
    return this.me.getOrderStats(user);
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
