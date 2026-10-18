import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.schema';
import { StaffController, StaffSessionController } from './staff.controller';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { STAFF_AUTH_ADMIN, type StaffAuthAdmin } from './staff.tokens';

/**
 * The team-accesses module (§8): its nine routes and everything they need.
 *
 * ─── POR QUÉ DOS CONTROLADORES Y NO UNO ────────────────────────────────────────
 *
 * Porque el §8 tiene ocho rutas bajo `businesses/:businessId/staff` y una que no
 * cuelga de un negocio —`POST /staff/session`, la que sella la sesión de quien
 * pregunta— y el ADR-0013 lo cuenta así. Meter la novena debajo del prefijo de
 * las otras ocho haría que el prefijo afirmara «de este negocio se administra»
 * para una ruta que no administra nada. Los dos viven en el mismo archivo porque
 * son las nueve rutas de un solo módulo y leerlas juntas vale más que dos
 * archivos de cuarenta líneas.
 *
 * ─── POR QUÉ EL CLIENTE DE AUTH ES UN PROVIDER ─────────────────────────────────
 *
 * `service_role` is the only key that can create an `auth.users`, and
 * `business_members` has no write policy at all (§6.3): this module IS the writer,
 * which makes the seam between "two writes that can disagree" (the auth user and
 * the membership) something the module owns rather than something a caller
 * assembles. The factory lives here, once, instead of in the service's
 * constructor where `BusinessesService` builds its own — same credentials, same
 * `{ autoRefreshToken: false, persistSession: false }`, because an API process
 * must never try to keep a user session alive for an account it administers.
 */
@Module({
  controllers: [StaffController, StaffSessionController],
  providers: [
    StaffService,
    StaffRepository,
    {
      provide: STAFF_AUTH_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StaffAuthAdmin =>
        createClient(
          config.get('SUPABASE_URL', { infer: true }),
          config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },
  ],
  // Exported because any future "cut every access" operation from the admin app
  // (§10) is a consumer of this service — and the ownership predicate that was
  // copied three times (`businesses.service.ts:731-735`) has to have exactly one
  // home.
  exports: [StaffService, StaffRepository],
})
export class StaffModule {}
