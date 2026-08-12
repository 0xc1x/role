import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { AuthService } from './auth.service';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
} from '@0xc1x/role-commons';
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  LogoutRequest,
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

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out (revoke refresh token globally)' })
  @ApiOkResponse({ description: 'Logged out successfully' })
  logout(
    @Body(new ZodValidationPipe(LogoutRequestSchema))
    body: LogoutRequest,
  ) {
    return this.authService.logout(body);
  }
}
