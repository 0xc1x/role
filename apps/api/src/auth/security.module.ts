import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { SupabaseTokenVerifier } from './supabase-token-verifier';

/**
 * Security infrastructure: JWT auth and role guards (default-deny globales).
 * Distinct from `modules/auth` (login/register feature module).
 * Nota: módulo @Global con guards vía APP_GUARD. Exporta SOLO
 * `SupabaseTokenVerifier`, y ahora sí hay un motivo: `AuthService.resetPassword`
 * verifica con él el token que el cliente le entrega en el body, y un provider
 * no exportado de un @Global no es inyectable desde otro módulo. Los guards no
 * se exportan porque nadie los importa (y el export sin uso lo marca el doctor).
 */
@Global()
@Module({
  providers: [
    AuthGuard,
    RolesGuard,
    SupabaseTokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SupabaseTokenVerifier],
})
export class SecurityModule {}
