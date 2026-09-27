import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  deviceTokens,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';

export type ProfileRow = typeof profiles.$inferSelect;
export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type ConsumerNotificationPreferencesRow =
  typeof consumerNotificationPreferences.$inferSelect;
export type UserConsentRow = typeof userConsents.$inferSelect;
export type DeviceTokenRow = typeof deviceTokens.$inferSelect;

/**
 * Every write patch is built from an explicit allowlist of columns, and
 * `profiles` is the reason that matters most: `role` is a `public.app_role`
 * column on a table this service owns, so a patch typed as
 * `Partial<typeof profiles.$inferInsert>` would compile happily and hand a
 * self-service caller a privilege escalation. Naming the four writable columns
 * makes the missing fifth one a compile error instead of a reviewer's job.
 */
export type MyProfilePatch = Partial<
  Pick<ProfileRow, 'full_name' | 'avatar_url' | 'phone' | 'city'>
>;
export type MyPreferencesPatch = Partial<
  Pick<
    UserPreferencesRow,
    'notification_radius_km' | 'favorite_categories' | 'language' | 'theme_mode'
  >
>;
export type MyNotificationPreferencesPatch = Partial<
  Omit<ConsumerNotificationPreferencesRow, 'user_id' | 'created_at'>
>;

export interface AccountSnapshot {
  profile: ProfileRow | null;
  preferences: UserPreferencesRow | null;
  notificationPreferences: ConsumerNotificationPreferencesRow | null;
  consents: UserConsentRow[];
}

/**
 * Every statement here is keyed on the CALLER's id, taken from the token
 * subject and never from a body or a path segment. That is the whole
 * authorisation story of this repository: the API connects as the `postgres`
 * pooler role — the owner of every one of these tables, and therefore exempt
 * from RLS — so the `where user_id = $1` in each query IS the access control.
 * There is no policy behind it to lean on.
 */
@Injectable()
export class MeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * `GET /me` in one snapshot.
   *
   * One transaction, four reads. The transaction is for CONSISTENCY, not
   * atomicity: these four rows are seeded together by the same trigger chain and
   * read together on every app start, so a caller must never be handed a profile
   * that disagrees with the preferences next to it. Issuing them on one pooled
   * connection also means the four reads cost one checkout instead of four.
   */
  async readAccount(userId: string): Promise<AccountSnapshot> {
    return this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      const [preferences] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.user_id, userId))
        .limit(1);
      const [notificationPreferences] = await tx
        .select()
        .from(consumerNotificationPreferences)
        .where(eq(consumerNotificationPreferences.user_id, userId))
        .limit(1);
      const consents = await tx
        .select()
        .from(userConsents)
        .where(eq(userConsents.user_id, userId))
        .orderBy(asc(userConsents.consent_type));

      return {
        profile: profile ?? null,
        preferences: preferences ?? null,
        notificationPreferences: notificationPreferences ?? null,
        consents,
      };
    });
  }

  async findProfile(userId: string): Promise<ProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  }

  async updateProfile(
    userId: string,
    patch: MyProfilePatch,
  ): Promise<ProfileRow | null> {
    const [row] = await this.db
      .update(profiles)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    return row ?? null;
  }

  async findPreferences(userId: string): Promise<UserPreferencesRow | null> {
    const [row] = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.user_id, userId))
      .limit(1);
    return row ?? null;
  }

  async updatePreferences(
    userId: string,
    patch: MyPreferencesPatch,
  ): Promise<UserPreferencesRow | null> {
    const [row] = await this.db
      .update(userPreferences)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(userPreferences.user_id, userId))
      .returning();
    return row ?? null;
  }

  async findNotificationPreferences(
    userId: string,
  ): Promise<ConsumerNotificationPreferencesRow | null> {
    const [row] = await this.db
      .select()
      .from(consumerNotificationPreferences)
      .where(eq(consumerNotificationPreferences.user_id, userId))
      .limit(1);
    return row ?? null;
  }

  async updateNotificationPreferences(
    userId: string,
    patch: MyNotificationPreferencesPatch,
  ): Promise<ConsumerNotificationPreferencesRow | null> {
    const [row] = await this.db
      .update(consumerNotificationPreferences)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(consumerNotificationPreferences.user_id, userId))
      .returning();
    return row ?? null;
  }

  async listConsents(userId: string): Promise<UserConsentRow[]> {
    return this.db
      .select()
      .from(userConsents)
      .where(eq(userConsents.user_id, userId))
      .orderBy(asc(userConsents.consent_type));
  }

  /**
   * `PUT /me/consents` — set the state of ONE declared consent.
   *
   * An upsert, not an insert, and not an update-then-insert: the three consent
   * rows are seeded by `UserDefaultsService` and by the `create_default_consents`
   * trigger, so a plain INSERT for a type the account already has would raise
   * 23505 on the `UNIQUE (user_id, consent_type)` constraint. An
   * update-then-insert would be correct too and would need two round trips plus a
   * retry path for the race between the two. `ON CONFLICT (user_id,
   * consent_type) DO UPDATE` is one statement, atomic against a concurrent
   * request for the same consent, and leaves the `UNIQUE` constraint in charge
   * of picking the row.
   *
   * WHY THE TIMESTAMPS ARE CONDITIONAL: this has to be idempotent, and
   * `granted_at = now()` on every call is not. A second `PUT {granted: true}`
   * would move `granted_at` forward and the response would differ from the
   * first, so a client that retries on a flaky connection would see its own
   * write change underneath it. So each timestamp moves only on the TRANSITION
   * it records:
   *
   *   - `granted_at` advances only when the consent goes from not-granted to
   *     granted. Re-granting an already granted consent preserves the moment it
   *     was first given, which is the moment an audit asks about.
   *   - `revoked_at` is cleared on a grant and set on the first revoke only
   *     (`coalesce`), so repeated revokes are stable and a re-grant/re-revoke
   *     cycle records the latest revocation.
   *   - `updated_at` advances only when `granted` itself changed, so a repeated
   *     PUT leaves the row byte-identical and the response with it.
   *
   * The last one is safe because `granted = true` and `revoked_at IS NOT NULL`
   * are mutually exclusive on this path: a grant clears `revoked_at`, a revoke
   * clears `granted`, and the seeder writes both false and null. So
   * `granted` differing is the ONLY way either timestamp can move, and one
   * comparison covers all three. A row that somehow violates that invariant
   * would keep its stale timestamp until the next real transition; the write
   * path cannot produce one.
   *
   * `excluded` is the row the INSERT proposed; every other reference on the
   * right-hand side is the row already in the table, which is the existing state
   * the transition is measured against.
   */
  async upsertConsent(
    userId: string,
    consentType: string,
    granted: boolean,
  ): Promise<UserConsentRow | null> {
    const [row] = await this.db
      .insert(userConsents)
      .values({ user_id: userId, consent_type: consentType, granted })
      .onConflictDoUpdate({
        target: [userConsents.user_id, userConsents.consent_type],
        set: {
          granted,
          granted_at: sql`case when excluded.granted and not ${userConsents.granted} then now() else ${userConsents.granted_at} end`,
          revoked_at: sql`case when excluded.granted then null else coalesce(${userConsents.revoked_at}, now()) end`,
          updated_at: sql`case when ${userConsents.granted} is distinct from excluded.granted then now() else ${userConsents.updated_at} end`,
        },
      })
      .returning();
    return row ?? null;
  }

  /**
   * `POST /me/devices` — register a push token, transferring it when the same
   * physical device arrives under a different account.
   *
   * THE TRANSFER, AND WHY `ON CONFLICT DO NOTHING` IS WRONG HERE:
   * `device_tokens.token` is UNIQUE GLOBALLY, not per user, and a push token
   * belongs to the DEVICE, not to the account. The moment a user signs out of
   * that device and signs in as somebody else, the next register presents a
   * token that already exists under a `user_id` that is not the caller's. Three
   * naive answers are all wrong:
   *
   *   1. `ON CONFLICT DO NOTHING` — the insert is swallowed and the call returns
   *      the PREVIOUS owner's row. The device silently keeps receiving the old
   *      account's pushes, and the new account's registration appears to have
   *      succeeded while doing nothing.
   *   2. surfacing 23505 as a conflict — the client cannot fix it. The token is
   *      not wrong, the ownership is, and the caller has no other way to say
   *      "this device is mine now".
   *   3. deactivate the old row, then insert a new one — two statements with a
   *      window between them in which the row is owned by nobody, and it still
   *      needs a retry path for two devices racing on the same token.
   *
   * What this does instead: `ON CONFLICT (token) DO UPDATE SET user_id =
   * excluded.user_id`, which is the ONLY shape that can satisfy both halves of
   * the requirement at once. It moves the row to the caller, so the device ends
   * up owned by the current user; and because the ownership is changed on the
   * row itself rather than by creating a second one, there is no instant at
   * which the row is reachable by the old account. A revoke is the only thing
   * that can leave a row inactive, and `revokeDevice` scopes itself to the
   * caller, so after the transfer the previous owner's `DELETE` is a no-op that
   * cannot reach the device at all.
   *
   * The row is read `FOR UPDATE` first, in the same transaction. That read is
   * not what makes the write safe — the `ON CONFLICT` clause and the unique
   * index are — it is here so `previousUserId` is the state the upsert is
   * actually about to replace (a consistent read on one connection) and so two
   * concurrent registers of the same token serialise instead of reporting the
   * same transfer twice.
   *
   * `device_info` is `coalesce(excluded, stored)`: a client that re-registers
   * without device metadata does not erase the metadata it once sent. Clearing
   * it is `DELETE /me/devices` followed by a fresh `POST`, and that is the only
   * way — an omitted key and an explicit `null` are the same value after
   * parsing, so no SQL can tell them apart here.
   */
  async registerDevice(input: {
    userId: string;
    token: string;
    platform: 'ios' | 'android' | 'web';
    deviceInfo?: Record<string, unknown> | null;
  }): Promise<{ row: DeviceTokenRow; previousUserId: string | null }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: deviceTokens.id,
          user_id: deviceTokens.user_id,
        })
        .from(deviceTokens)
        .where(eq(deviceTokens.token, input.token))
        .for('update')
        .limit(1);

      const [row] = await tx
        .insert(deviceTokens)
        .values({
          user_id: input.userId,
          token: input.token,
          platform: input.platform,
          device_info: input.deviceInfo ?? null,
        })
        .onConflictDoUpdate({
          target: deviceTokens.token,
          set: {
            user_id: input.userId,
            platform: input.platform,
            device_info: sql`coalesce(excluded.device_info, ${deviceTokens.device_info})`,
            is_active: true,
            updated_at: sql`now()`,
          },
        })
        .returning();

      if (!row) {
        throw new Error('Failed to register device token');
      }

      return {
        row,
        // Null when the row is new; equal to the caller's own id when this was a
        // plain re-registration. Only a DIFFERENT id is a transfer.
        previousUserId: existing?.user_id ?? null,
      };
    });
  }

  /**
   * `DELETE /me/devices` — revoke a push token.
   *
   * Scoped to `user_id = caller AND token = $1`, and that scoping is the answer
   * to "do not leave the device reachable by the old account": after a transfer
   * the row belongs to the new user, so the previous owner's revoke matches no
   * row and deactivates nothing. A token-only predicate here would let the old
   * account switch the new owner's device off.
   *
   * Deactivation, not DELETE: the send path filters on `is_active = true`, so
   * deactivating is a revoke; and keeping the row means the same device
   * re-registering later updates one row instead of accumulating one row per
   * sign-in. `NotificationsRepository.cleanupOldTokens` is what eventually
   * removes rows that have been inactive for 90 days.
   *
   * Returns whether a row was actually changed, so the service can stay silent
   * about a token this caller never owned.
   */
  async revokeDevice(userId: string, token: string): Promise<boolean> {
    const rows = await this.db
      .update(deviceTokens)
      .set({ is_active: false, updated_at: new Date() })
      .where(
        and(eq(deviceTokens.user_id, userId), eq(deviceTokens.token, token)),
      )
      .returning({ id: deviceTokens.id });
    return rows.length > 0;
  }
}
