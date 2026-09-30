import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  deviceTokens,
  marketingPreferences,
  orders,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';

export type ProfileRow = typeof profiles.$inferSelect;
export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type ConsumerNotificationPreferencesRow =
  typeof consumerNotificationPreferences.$inferSelect;
export type MarketingPreferencesRow = typeof marketingPreferences.$inferSelect;
export type UserConsentRow = typeof userConsents.$inferSelect;
export type DeviceTokenRow = typeof deviceTokens.$inferSelect;

/**
 * `unsubscribed_at`, `source` and `updated_at` are NOT here, and their absence
 * is the point: the caller owns the subscription DECISION, the server owns the
 * record of when the decision was taken and of which surface took it. See
 * `MeService.updateMarketingPreferences` and `upsertMarketingPreferences`.
 */
export type MyMarketingPreferencesPatch = Partial<
  Pick<MarketingPreferencesRow, 'is_subscribed' | 'categories'>
>;

/**
 * The two columns of `user_order_stats` as Postgres returns them: `count(*)`
 * already cast to `int` so it arrives as a number instead of a bigint string,
 * and `numeric` left as the string Postgres sends.
 */
export type UserOrderStatsRow = { orders_count: number; total_saved: string };

/**
 * The one value this API ever writes to `marketing_preferences.source`.
 *
 * The column is provenance — WHO performed the change — and there are exactly
 * three writers in the system: the migration backfill (`seed`), the footer
 * unsubscribe link (`email_link`, in `EmailMarketingRepository`), and this route
 * (`app`). It is deliberately not a request field: a caller that could label
 * its own unsubscribe would make the column worthless for the one question it
 * exists to answer, and `UpdateMyMarketingPreferencesSchema` has no `source`
 * key for the pipe to leave it in.
 */
const MARKETING_SOURCE_APP = 'app';

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

  // ─── Preferencias de marketing ─────────────────────────────────────

  /**
   * `marketing_preferences` is not seeded by `handle_new_user` and not by
   * `UserDefaultsService`; the only writer at signup time is a one-off
   * `insert ... select` backfill in the email-marketing migration, which covers
   * the profiles that existed that day. So a `null` here is the NORMAL state of
   * an account created since, and the caller reads it as "subscribed, with the
   * column default" — which is what `MeService` resolves it to.
   */
  async findMarketingPreferences(
    userId: string,
  ): Promise<MarketingPreferencesRow | null> {
    const [row] = await this.db
      .select()
      .from(marketingPreferences)
      .where(eq(marketingPreferences.user_id, userId))
      .limit(1);
    return row ?? null;
  }

  /**
   * THE STAMPING IS SERVER-SIDE, and this statement is where it happens.
   *
   * `unsubscribed_at` is the compliance-visible half of an unsubscribe: it is
   * the column an auditor reads to answer "when did this person stop receiving
   * our campaigns", and a value the CALLER supplied would be a caller-supplied
   * audit record. So `is_subscribed` is written, and the timestamp is derived
   * from it here — the caller never gets to say when.
   *
   * This is not a new position. Every other writer of this column in the
   * codebase already derives it: `EmailMarketingRepository.unsubscribe` (the
   * footer link) sets `new Date()`, and `AuthAccountRepository`'s account
   * anonymisation sets `new Date()`. The one writer that does NOT derive it is
   * mobile's PostgREST upsert, which is precisely the weakness this route
   * removes. Consistency was the tiebreaker; the audit trail was the argument.
   *
   * WHY THE `case`, AND WHY IT IS NOT `now()` UNCONDITIONALLY: this has to
   * survive a client that retries on a flaky connection, and `now()` on every
   * call would move the moment of withdrawal forward on a retry of the very
   * request that withdrew it. The timestamp advances on the TRANSITION only:
   *
   *   - unsubscribing from something that was not unsubscribed stamps `now()`.
   *   - re-subscribing clears it, because a subscribed person has no moment of
   *     withdrawal; keeping the old value would leave a row that says
   *     `is_subscribed = true, unsubscribed_at = <date>` and any audit reading
   *     the pair would have to guess which column wins.
   *   - unsubscribing an already-unsubscribed row preserves the first
   *     withdrawal, which is the moment the audit asks about.
   *
   * THE INSERT PATH STAMPS TOO, and that is not a detail: `ON CONFLICT DO
   * UPDATE` does not run when there is no conflict, so an account that has
   * never had a `marketing_preferences` row — the normal state of an account
   * created since the backfill migration — would take its FIRST unsubscribe
   * with a NULL `unsubscribed_at`. The one unsubscribe that creates the
   * compliance record would be the one that does not record it. There is no
   * previous state to measure a transition against on that path, so the
   * transition there is unconditional, and it is written with the DATABASE's
   * `now()` rather than the API host's clock: the value is an audit record and
   * it should not depend on which application process handled the request.
   *
   * `excluded` is the row the INSERT proposed; every other reference on the
   * right-hand side of the conflict clause is the row already in the table,
   * which is the state the transition is measured against. Same shape as
   * `upsertConsent`.
   *
   * AN UPSERT, not an update-then-insert, and for the same reason as
   * `upsertConsent`: the row may not exist, `user_id` is the primary key, and
   * one statement closes the race between "read it, it is missing" and "two
   * requests create it" without a retry path.
   *
   * `source` is in the INSERT values and NOT in the conflict SET, so it is
   * written when the row is created and preserved afterwards. That is
   * `EmailMarketingRepository.unsubscribe`'s convention exactly, and it is the
   * right one: the column records where the CURRENT state came from, and a
   * later edit of `categories` does not retroactively reattribute the
   * unsubscribe.
   *
   * AN EMPTY PATCH IS A READ. `ON CONFLICT DO UPDATE` with no `SET` columns is
   * a syntax error, and the alternative — writing nothing but still bumping
   * `updated_at` — would make "last changed" mean "last asked". So a PATCH that
   * changes nothing returns the stored row untouched, and `updated_at` keeps
   * meaning what its name says.
   */
  async upsertMarketingPreferences(
    userId: string,
    patch: MyMarketingPreferencesPatch,
  ): Promise<MarketingPreferencesRow | null> {
    if (Object.keys(patch).length === 0) {
      return this.findMarketingPreferences(userId);
    }

    const changed: SQL[] = [];
    const set: Record<string, SQL> = {};

    if (patch.is_subscribed !== undefined) {
      set.is_subscribed = sql`excluded.is_subscribed`;
      set.unsubscribed_at = sql`case
        when excluded.is_subscribed then null
        when ${marketingPreferences.is_subscribed} is not false then now()
        else ${marketingPreferences.unsubscribed_at}
      end`;
      changed.push(
        sql`${marketingPreferences.is_subscribed} is distinct from excluded.is_subscribed`,
      );
    }
    if (patch.categories !== undefined) {
      set.categories = sql`excluded.categories`;
      // `is distinct from` compares arrays element-wise, so re-sending the list
      // the user already had is a no-op rather than a "change".
      changed.push(
        sql`${marketingPreferences.categories} is distinct from excluded.categories`,
      );
    }
    set.updated_at = sql`case when ${sql.join(changed, sql` and `)} then now() else ${marketingPreferences.updated_at} end`;

    const [row] = await this.db
      .insert(marketingPreferences)
      .values({
        user_id: userId,
        source: MARKETING_SOURCE_APP,
        ...(patch.is_subscribed !== undefined
          ? {
              is_subscribed: patch.is_subscribed,
              // `null` is passed as a value, not as SQL: there is nothing to
              // derive on this path beyond "a subscribed person has no moment of
              // withdrawal".
              unsubscribed_at: patch.is_subscribed ? null : sql`now()`,
            }
          : {}),
        ...(patch.categories !== undefined
          ? { categories: patch.categories }
          : {}),
      })
      .onConflictDoUpdate({
        target: marketingPreferences.user_id,
        set,
      })
      .returning();
    return row ?? null;
  }

  /**
   * `user_order_stats` for the CALLER, and the caller is the only argument.
   *
   * THE RULE, WHICH IS NOT THE RULE THE TWO BUSINESS AGGREGATES USE:
   * `status <> 'cancelled'`, not `status = 'completed'`. A cancelled order
   * that was never completed still counts here, and its `original_price -
   * price` still counts toward the "ahorrado" this endpoint reports. That is
   * the SQL's behaviour, and the mobile copy of it was built against it; a
   * mirror that "fixed" the asymmetry would report a different number than the
   * screen the user has been reading, and the difference would be a silent
   * change to a figure people trust about their own impact.
   *
   * `<> 'cancelled'` rather than `not in (...)`: it is what the function says,
   * and it keeps a status added to the `order_status` enum later from silently
   * dropping out of this aggregate.
   */
  async userOrderStats(userId: string): Promise<UserOrderStatsRow> {
    const [row] = await this.db
      .select({
        orders_count: sql<number>`count(*)::int`,
        total_saved: sql<string>`coalesce(sum(${orders.original_price} - ${orders.price}), 0)::numeric`,
      })
      .from(orders)
      .where(and(eq(orders.user_id, userId), ne(orders.status, 'cancelled')));
    return {
      orders_count: row?.orders_count ?? 0,
      total_saved: row?.total_saved ?? '0',
    };
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
