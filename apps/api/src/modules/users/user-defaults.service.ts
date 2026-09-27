import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';

/**
 * ADR-0008 phase 1.5: API mirror of the Supabase trigger chain that provisions
 * a new account:
 *
 *   auth.users  AFTER INSERT  -> handle_new_user          (profiles)
 *   profiles    AFTER INSERT  -> create_user_preferences  (user_preferences,
 *                                                          consumer_notification_preferences)
 *   profiles    AFTER INSERT  -> create_default_consents  (user_consents)
 *
 * The API needs to own this before the cutover that drops those triggers:
 * registration and business onboarding create the auth user through GoTrue and
 * the profile is what every other table (and AuthGuard) hangs off, so losing it
 * turns an account into a permanent 401.
 *
 * WHY THERE IS NO `ENABLE_API_MIRROR_USERS` FLAG HERE (do not "fix" this):
 * the other mirrors are gated because they duplicate WRITES of money and
 * orders, where a double write corrupts state and a flag defaulting to off is
 * the safe default. This one is idempotent seeding of defaults — every insert
 * carries the same `on conflict ... do nothing` clause as the trigger it
 * mirrors, so running it while the triggers are still live changes no row, and
 * running it after the cutover is what keeps registration working. A flag would
 * be pure ceremony with one failure mode: defaulting to off leaves the cutover
 * seam exactly where it is today, which is the thing phase 1.5 exists to close.
 */

/** Roles a caller may request at signup. `admin` is deliberately absent. */
const SELF_SERVICE_ROLES = ['user', 'business'] as const;

export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export interface SeedUserDefaultsInput {
  /** `auth.users.id`: also the primary key of `profiles`. */
  id: string;
  email: string;
  /** `raw_user_meta_data ->> 'full_name'`. */
  fullName?: string | null;
  /** `raw_user_meta_data ->> 'avatar_url'`. */
  avatarUrl?: string | null;
  /** `auth.users.phone`. */
  phone?: string | null;
  /** `raw_user_meta_data ->> 'role'`, allowlisted by {@link resolveRole}. */
  requestedRole?: string | null;
}

/**
 * The `granted` values live in the trigger body, not in a column default, so
 * they are trigger semantics and have to be stated here. The two preferences
 * tables are the opposite case: every non-key column has a DEFAULT, so only the
 * key is inserted and Postgres fills the rest. Restating radius 5 / `{}` / 'es'
 * / 'system' / push_enabled here would be a second source of truth for values
 * that a column DEFAULT already owns — the two would drift on the first
 * migration that changes a default.
 */
const DEFAULT_CONSENTS: ReadonlyArray<{
  consent_type: string;
  granted: boolean;
}> = [
  { consent_type: 'analytics', granted: false },
  { consent_type: 'marketing', granted: false },
  { consent_type: 'notifications', granted: true },
];

@Injectable()
export class UserDefaultsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Mirrors the trigger's `case when ... ->> 'role' in ('user','business')`.
   * `admin` is a platform-controlled role, so a value coming from signup
   * metadata can never produce it.
   */
  private resolveRole(requestedRole?: string | null): SelfServiceRole {
    return SELF_SERVICE_ROLES.find((role) => role === requestedRole) ?? 'user';
  }

  /**
   * Creates the profile and every default row the trigger chain would create.
   *
   * One transaction, because the trigger chain ran inside the `auth.users`
   * INSERT: a half-seeded user is a state the SQL never produced. A failure
   * rolls the whole thing back and leaves the caller to repair it (see
   * `AuthService.login`), rather than leaving preferences without a profile.
   *
   * Idempotent by construction — every insert carries the conflict target of
   * the trigger it mirrors, so this is correct both while the triggers are live
   * (they win the race, this is a no-op) and after the cutover (this is the only
   * writer).
   */
  async seed(input: SeedUserDefaultsInput): Promise<void> {
    const role = this.resolveRole(input.requestedRole);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(profiles)
        .values({
          id: input.id,
          email: input.email,
          // The trigger stores '' (not NULL) when metadata has no full_name.
          full_name: input.fullName ?? '',
          avatar_url: input.avatarUrl ?? null,
          phone: input.phone ?? null,
          role,
        })
        .onConflictDoNothing({ target: profiles.id });

      await tx
        .insert(userPreferences)
        .values({ user_id: input.id })
        .onConflictDoNothing({ target: userPreferences.user_id });

      await tx
        .insert(consumerNotificationPreferences)
        .values({ user_id: input.id })
        .onConflictDoNothing({
          target: consumerNotificationPreferences.user_id,
        });

      await tx
        .insert(userConsents)
        .values(
          DEFAULT_CONSENTS.map((consent) => ({
            user_id: input.id,
            consent_type: consent.consent_type,
            granted: consent.granted,
          })),
        )
        .onConflictDoNothing({
          target: [userConsents.user_id, userConsents.consent_type],
        });
    });
  }
}
