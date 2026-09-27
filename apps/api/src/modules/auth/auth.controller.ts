import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { AuthService } from './auth.service';
import {
  ChangeEmailRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
} from '@0xc1x/role-commons';
import type {
  ChangeEmailRequest,
  ChangeEmailResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@0xc1x/role-commons';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ type: Object })
  login(
    @Body(new ZodValidationPipe(LoginRequestSchema))
    body: LoginRequest,
  ) {
    return this.authService.login(body);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: Object })
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema))
    body: RegisterRequest,
  ) {
    return this.authService.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema))
    body: RefreshRequest,
  ) {
    return this.authService.refresh(body);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ description: 'The authenticated user profile' })
  getProfile(@CurrentUser() user: AuthUser) {
    return { user };
  }

  /**
   * `POST /auth/forgot-password`.
   *
   * THROTTLE — the one number this route is really about.
   *
   * `ThrottlerGuard` keys on the request tracker (the IP), and that is the only
   * lever a `@Throttle` decorator has, so the limit has to answer the case the
   * per-IP bucket is worst at: ONE host spraying many addresses. Two windows,
   * because one is not enough:
   *
   *  - `default` 3/minute, the same budget `register` already has. It is not
   *    looser than account CREATION for a route that sends mail, and recovery is
   *    a rare flow where a user retries a typo at most once or twice.
   *  - `auth` 5/hour on the `auth` bucket (globally 10/minute, overridden per
   *    route here). Without the long window, 3/minute is 180 emails per hour
   *    from a single host: enough to be a mailing-list abuse report against
   *    `notificaciones@role.ec`'s domain reputation, and enough to flood one
   *    person's inbox. Five an hour is a number a person never reaches by
   *    accident.
   *
   * It does NOT bound a spray from many hosts, and this API cannot see addresses
   * in aggregate. A per-address cooldown in the send path is the other half and
   * is deliberately not here: `email_sends` has no index on `email`, so it would
   * be an unindexed scan on an unauthenticated hot path. That is a follow-up
   * that needs the index, not a scan smuggled in.
   *
   * 200 in every case, known address or not. See `AuthService.forgotPassword`.
   */
  @Public()
  @Throttle({
    default: { limit: 3, ttl: 60_000 },
    auth: { limit: 5, ttl: 3_600_000 },
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password recovery link (always the same 200)',
  })
  @ApiOkResponse({
    description:
      'The same body whether or not the address belongs to an account',
  })
  forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordRequestSchema))
    body: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    return this.authService.forgotPassword(body);
  }

  /**
   * `POST /auth/reset-password`.
   *
   * `@Public()` because the caller is not signed in yet — they hold a recovery
   * token, not a session — but the token is VERIFIED in the service, against the
   * same rules as a session bearer. 5/minute per IP: high enough for a person
   * who mistyped a password twice before getting the link right, low enough that
   * a token-guessing loop is not cheap.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password from a recovery link and revoke all sessions',
  })
  @ApiOkResponse({ description: 'The password was updated' })
  @ApiUnauthorizedResponse({
    description: 'The recovery token is missing, invalid or expired',
  })
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema))
    body: ResetPasswordRequest,
  ): Promise<ResetPasswordResponse> {
    return this.authService.resetPassword(body);
  }

  /**
   * `POST /auth/change-email` — bearer required, and the path `PATCH /me` points
   * at instead of refusing without one.
   *
   * 202, because the change is initiated and not applied: GoTrue holds it until
   * the new address is confirmed, and the trigger copies the result into
   * `profiles.email` when it lands. The same 3/minute budget as `forgot-password`
   * because it also enqueues a mail, plus the same hourly `auth` window — a
   * person changes their address a handful of times in a lifetime, and a loop
   * that does it more often is not a person.
   */
  @Throttle({
    default: { limit: 3, ttl: 60_000 },
    auth: { limit: 5, ttl: 3_600_000 },
  })
  @Post('change-email')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request an email change (applied once the new address confirms)',
  })
  @ApiAcceptedResponse({ description: 'The change was initiated' })
  @ApiBearerAuth('bearer')
  changeEmail(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ChangeEmailRequestSchema))
    body: ChangeEmailRequest,
  ): Promise<ChangeEmailResponse> {
    return this.authService.changeEmail(user, body);
  }

  /**
   * `DELETE /auth/account` — 204 in both branches.
   *
   * An account with order history is anonymised rather than deleted, because
   * `orders.user_id` cascades from `profiles`; see `AuthService.deleteAccount`.
   * The response cannot say which happened, and neither can the log.
   *
   * 3/minute for an irreversible action: a client that retries a DELETE because
   * the network dropped is retrying an idempotent no-op, and one that fires it
   * more often than that is not a client.
   */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my account (anonymised when order history must survive)',
  })
  @ApiNoContentResponse({ description: 'Deleted or anonymised — always 204' })
  @ApiBearerAuth('bearer')
  deleteAccount(@CurrentUser() user: AuthUser): Promise<void> {
    return this.authService.deleteAccount(user);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out (revoke the current session)' })
  @ApiOkResponse({ description: 'Current session logged out successfully' })
  logout(
    @Body(new ZodValidationPipe(LogoutRequestSchema))
    body: LogoutRequest,
  ) {
    return this.authService.logout(body);
  }
}
