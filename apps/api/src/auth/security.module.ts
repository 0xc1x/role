import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Security infrastructure: JWT auth and role guards (default-deny globales).
 * Distinct from `modules/auth` (login/register feature module).
 */
@Global()
@Module({
  providers: [
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthGuard, RolesGuard],
})
export class SecurityModule {}
