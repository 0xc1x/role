import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Security infrastructure: JWT auth, optional auth, and role guards.
 * Distinct from `modules/auth` (login/register feature module).
 */
@Global()
@Module({
  providers: [
    AuthGuard,
    {
      provide: OptionalAuthGuard,
      useFactory: (reflector: Reflector, authGuard: AuthGuard) =>
        new OptionalAuthGuard(reflector, authGuard),
      inject: [Reflector, AuthGuard],
    },
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthGuard, OptionalAuthGuard, RolesGuard],
})
export class SecurityModule {}
