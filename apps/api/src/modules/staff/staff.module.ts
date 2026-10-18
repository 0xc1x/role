import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.schema';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { STAFF_AUTH_ADMIN, type StaffAuthAdmin } from './staff.tokens';

/**
 * The team-accesses module (§8), with no controller yet.
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
  // Exported because the controller of the next task, and any future "cut every
  // access" operation from the admin app (§10), are consumers of this service —
  // and the ownership predicate that was copied three times
  // (`businesses.service.ts:731-735`) has to have exactly one home.
  exports: [StaffService, StaffRepository],
})
export class StaffModule {}
