import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Security infrastructure: JWT auth and role guards (default-deny globales).
 * Distinct from `modules/auth` (login/register feature module).
 * Nota: módulo @Global con guards vía APP_GUARD; no exporta providers
 * porque ningún módulo los importa (el export sin uso lo marca el doctor).
 */
@Global()
@Module({
  providers: [
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class SecurityModule {}
