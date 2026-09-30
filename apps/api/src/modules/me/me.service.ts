import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  DeviceTokenDto,
  MeAccountDto,
  MeMarketingPreferencesDto,
  MeNotificationPreferencesDto,
  MePreferencesDto,
  ProfileDto,
  RegisterMyDeviceDto,
  UpdateMyMarketingPreferencesDto,
  UpdateMyNotificationPreferencesDto,
  UpdateMyPreferencesDto,
  UpdateMyProfileDto,
  UpsertMyConsentDto,
  UserConsentDto,
  UserOrderStatsResponseDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { MeMapper } from './me.mapper';
import type {
  MyMarketingPreferencesPatch,
  MyNotificationPreferencesPatch,
  MyPreferencesPatch,
  MyProfilePatch,
} from './me.repository';
import { MeRepository } from './me.repository';

/**
 * The caller's own account: profile, preferences, notification preferences,
 * consents and push devices.
 *
 * Three things are true of every method here and none of them is the guard:
 *
 *  1. The owner is ALWAYS `user.id`, the token subject. There is no method that
 *     takes a user id from a caller, so there is no method whose authorisation
 *     can be widened by a crafted body or path.
 *  2. This service connects as the `postgres` pooler role, which OWNS
 *     `profiles`, `user_preferences`, `consumer_notification_preferences`,
 *     `marketing_preferences`, `user_consents` and `device_tokens`, and a table
 *     owner is exempt from both RLS and the column-level grants. Every RLS
 *     policy in the brief — "own SELECT/UPDATE", "to authenticated" — describes
 *     a boundary that does not exist for these statements. The scoping is the
 *     `where user_id = caller` in each query, and the invariants below.
 *  3. Rows seeded by `UserDefaultsService` and by the Supabase trigger chain are
 *     ASSUMED, never created. A missing row is a `null` in a response, not a 404
 *     and not an insert: the API did not write it, so inventing it here would
 *     make this surface a second source of truth for a table it only reads. The
 *     one row this service DOES create is `marketing_preferences`, and only
 *     because an unsubscribe has to work for an account that has never had one.
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly me: MeRepository,
    private readonly categories: CategoriesRepository,
  ) {}

  /**
   * The whole account in one payload.
   *
   * Four rows that mobile currently fetches in four round trips on every app
   * start, always together, always small, and that the three PATCH routes below
   * each re-read. Returning them separately would be four GETs to describe four
   * settings screens; the point of `GET /me` is that they are one account, not
   * four resources that happen to share an owner.
   */
  async getAccount(user: AuthUser): Promise<MeAccountDto> {
    const snapshot = await this.me.readAccount(user.id);

    // A token subject with no profile row is an account `AuthGuard` would have
    // already rejected, so this is a broken state rather than a caller's error —
    // but 404 still beats returning `{ profile: null }` against a declared
    // non-null contract.
    if (!snapshot.profile) {
      throw new NotFoundException('Profile not found');
    }

    return {
      profile: MeMapper.toProfileDto(snapshot.profile),
      preferences: snapshot.preferences
        ? MeMapper.toPreferencesDto(snapshot.preferences)
        : null,
      notification_preferences: snapshot.notificationPreferences
        ? MeMapper.toNotificationPreferencesDto(
            snapshot.notificationPreferences,
          )
        : null,
      consents: MeMapper.toConsentListDtos(snapshot.consents),
    };
  }

  /**
   * `PATCH /me` — the four profile columns a user owns.
   *
   * `role` CANNOT BE REACHED FROM HERE, and the way that is guaranteed is the
   * shape of `UpdateMyProfileSchema` rather than a check in this method: `role`
   * is not a key of the object, so the parsed body has no such property, and
   * `MyProfilePatch` names only `full_name`, `avatar_url`, `phone` and `city`, so
   * a `role` in the patch is a compile error. That matters because the API
   * writes `profiles` as the table owner: RLS and the column grants are both
   * bypassed, and `handle_new_user` keeps the same allowlist for the same reason.
   * A body carrying `role` parses, and the role does not move.
   *
   * `email` is the fifth column, and it is refused rather than widened into the
   * patch: it is an identity change with a confirmation round-trip, and it lives
   * at `POST /auth/change-email`. See `assertEmailNotChanged`.
   */
  async updateProfile(
    user: AuthUser,
    body: UpdateMyProfileDto,
  ): Promise<ProfileDto> {
    // The one field the schema accepts and this service refuses. See
    // `assertEmailNotChanged` for why it is a refusal and not a write, and for
    // the route that does it instead.
    this.assertEmailNotChanged(body.email);

    const patch: MyProfilePatch = {};
    if (body.full_name !== undefined) patch.full_name = body.full_name;
    // `avatar_url` is a URL, stored as sent. There is no consumer upload path in
    // this API, and pretending a string was an upload is how a profile ends up
    // with a `data:` URI no image host will load.
    if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.city !== undefined) patch.city = body.city;

    const row = await this.me.updateProfile(user.id, patch);
    if (!row) {
      throw new NotFoundException('Profile not found');
    }
    return MeMapper.toProfileDto(row);
  }

  /**
   * WHY `email` IS STILL REFUSED HERE, NOW THAT THE API HAS THE ROUTE.
   *
   * `profiles.email` is a COPY of the GoTrue identity, and the copy is only ever
   * written by a trigger: `handle_new_user` on INSERT and
   * `sync_profile_email_on_auth_user_change` on UPDATE OF email. So a PATCH here
   * still has no way to move the two stores together, and the two candidate
   * implementations both end with them disagreeing, in opposite directions:
   *
   *   - Write `profiles.email` directly. Forbidden, and worse than useless: GoTrue
   *     still holds the old address, so the next login re-asserts the old
   *     identity and the column the caller just changed is overwritten. This is
   *     the "next login resurrects the old address" failure.
   *   - Call `updateUserById` from here and write nothing. That is exactly what
   *     `POST /auth/change-email` now does, and doing it from `/me` would split
   *     the flow in two: a caller who found one route would not find the other,
   *     and `/me` would have to answer 202 and initiate a confirmation
   *     round-trip inside a PATCH whose contract is "the row is now this".
   *
   * So the field stays refused HERE and lives at `POST /auth/change-email`, which
   * initiates the change, delivers the notice, and lets the trigger sync the
   * copy when GoTrue applies it. Mobile may also drive the same GoTrue flow
   * directly with `supabase.auth.updateUser({ email })` (ADR-0002: the consumer
   * app talks to Supabase, not to this API).
   *
   * A refusal with the working path named in it, still: a caller who asks to
   * change their address and gets a 200 has been lied to, and that is worse than
   * a 422 that tells them where to go.
   */
  private assertEmailNotChanged(email?: string): void {
    if (email === undefined) return;
    throw new UnprocessableEntityException({
      error: 'Unprocessable Entity',
      message:
        'email is the Supabase Auth identity and is not a profile column this endpoint can write. ' +
        'Use POST /api/v1/auth/change-email, which initiates the change and confirms it at the new address; ' +
        'profiles.email is synced by the auth trigger when the confirmation lands. ' +
        'Supabase clients may also do it directly with `supabase.auth.updateUser({ email })`.',
    });
  }

  async getPreferences(user: AuthUser): Promise<MePreferencesDto> {
    const row = await this.me.findPreferences(user.id);
    return {
      preferences: row ? MeMapper.toPreferencesDto(row) : null,
    };
  }

  /**
   * `PATCH /me/preferences`.
   *
   * `favorite_categories` goes through the catalog before it is stored; see
   * `resolveFavoriteCategories` for why that is not optional.
   *
   * A PATCH against an account whose preferences row was never seeded updates
   * nothing and answers `{ preferences: null }`. That is the honest answer for a
   * row this API does not own the creation of (the trigger chain and
   * `UserDefaultsService` seed it), and it is explicit rather than a 200 with a
   * silently discarded write.
   */
  async updatePreferences(
    user: AuthUser,
    body: UpdateMyPreferencesDto,
  ): Promise<MePreferencesDto> {
    const patch: MyPreferencesPatch = {};
    if (body.notification_radius_km !== undefined) {
      patch.notification_radius_km = body.notification_radius_km;
    }
    if (body.favorite_categories !== undefined) {
      patch.favorite_categories =
        body.favorite_categories === null
          ? null
          : await this.resolveFavoriteCategories(body.favorite_categories);
    }
    if (body.language !== undefined) patch.language = body.language;
    if (body.theme_mode !== undefined) patch.theme_mode = body.theme_mode;

    const row = await this.me.updatePreferences(user.id, patch);
    return { preferences: row ? MeMapper.toPreferencesDto(row) : null };
  }

  /**
   * DECISION: NORMALISE WHAT CAN MATCH, REJECT WHAT CANNOT. Both halves, on
   * purpose, and neither alone is right.
   *
   * `user_preferences.favorite_categories` is a `text[]` compared, lowercased on
   * both sides, against `categories.name` by `dispatch-nearby-offers`. `slug` is
   * ASCII-folded and never compared. Nothing in the system wrote this column, so
   * it is empty everywhere today and the bug is invisible until the first client
   * writes to it: a stored value that is not one of those display names matches
   * nothing, and the user's chosen categories silently filter nothing while the
   * UI reports them as selected.
   *
   * Reject-only would treat `'  panadería '` and `'Panadería'` as errors, which
   * is a category of client bug (picker sends the name, a route carries the slug,
   * a locale adds a space) that has nothing to do with the user's intent, and it
   * teaches clients to stop sending the field. Normalise-only would be the actual
   * hazard: dropping the values it cannot resolve means the caller sent three
   * categories, gets a 200, stores one, and has no way to tell which one was
   * dropped or that anything was — the identical silent-inert-list failure, one
   * layer down.
   *
   * So: every value that CAN match is resolved to the exact string the dispatch
   * function compares against (trimmed, case-folded back to the catalog's own
   * `name`, de-duplicated), and any value that cannot is reported back by name
   * in a 422. The caller keeps the authority to decide, the stored list always
   * works, and a value that would have been inert is impossible to write.
   *
   * The lookup covers `slug` as well as `name` as two SEPARATE maps: they are two
   * namespaces, and collapsing them into one would let a category resolve another
   * category's slug and store a name the user never picked.
   */
  private async resolveFavoriteCategories(values: string[]): Promise<string[]> {
    const catalog = await this.categories.listMatchable();

    const byName = new Map<string, string>();
    const bySlug = new Map<string, string>();
    for (const category of catalog) {
      byName.set(category.name.trim().toLowerCase(), category.name);
      bySlug.set(category.slug.trim().toLowerCase(), category.name);
    }

    const resolved: string[] = [];
    const seen = new Set<string>();
    const unmatched: string[] = [];

    for (const value of values) {
      const key = value.trim().toLowerCase();
      const name = byName.get(key) ?? bySlug.get(key);
      if (name === undefined) {
        unmatched.push(value);
        continue;
      }
      if (seen.has(name)) continue;
      seen.add(name);
      resolved.push(name);
    }

    if (unmatched.length > 0) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message:
          'favorite_categories must name a category of the active catalog. ' +
          'Unmatched value(s): the near-offer dispatch matches these entries against ' +
          'the category display names, so a value outside the catalog filters nothing.',
        details: { unmatched },
        allowed: catalog.map((category) => category.name),
      });
    }

    return resolved;
  }

  async getNotificationPreferences(
    user: AuthUser,
  ): Promise<MeNotificationPreferencesDto> {
    const row = await this.me.findNotificationPreferences(user.id);
    return {
      notification_preferences: row
        ? MeMapper.toNotificationPreferencesDto(row)
        : null,
    };
  }

  /**
   * `PATCH /me/notification-preferences`.
   *
   * The flags are booleans, so the only thing this can get wrong is the quiet
   * window. `quiet_hours_from` and `quiet_hours_to` are individually nullable
   * and the dispatch filter treats a half-set window as NO window at all
   * (`NotificationsRepository.filterNotInQuietHours` returns "allowed" unless
   * both are present) — which is the `favorite_categories` failure again: a
   * setting the user believes is on, stored in a shape that does nothing.
   *
   * The pairing is checked against the MERGED state rather than in the request
   * schema, because a PATCH may legitimately move one end of a window that is
   * already set on the other end, and a schema cannot see the row.
   */
  async updateNotificationPreferences(
    user: AuthUser,
    body: UpdateMyNotificationPreferencesDto,
  ): Promise<MeNotificationPreferencesDto> {
    const existing = await this.me.findNotificationPreferences(user.id);

    // `in`, not `??`: an explicit `null` CLEARS a column and must not fall
    // through to the stored value. An absent key is absent.
    const from =
      'quiet_hours_from' in body
        ? body.quiet_hours_from
        : (existing?.quiet_hours_from ?? null);
    const to =
      'quiet_hours_to' in body
        ? body.quiet_hours_to
        : (existing?.quiet_hours_to ?? null);

    const fromIsUnset = from === null;
    const toIsUnset = to === null;
    if (fromIsUnset !== toIsUnset) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message:
          'quiet_hours_from and quiet_hours_to must both be set or both be null: ' +
          'a half-configured window is treated as no window at all.',
      });
    }

    const patch: MyNotificationPreferencesPatch = {};
    if (body.push_enabled !== undefined) patch.push_enabled = body.push_enabled;
    if (body.email_enabled !== undefined)
      patch.email_enabled = body.email_enabled;
    if (body.sms_enabled !== undefined) patch.sms_enabled = body.sms_enabled;
    if (body.whatsapp_enabled !== undefined) {
      patch.whatsapp_enabled = body.whatsapp_enabled;
    }
    if (body.favorite_alerts_enabled !== undefined) {
      patch.favorite_alerts_enabled = body.favorite_alerts_enabled;
    }
    if (body.pickup_reminders_enabled !== undefined) {
      patch.pickup_reminders_enabled = body.pickup_reminders_enabled;
    }
    if (body.last_minute_deals_enabled !== undefined) {
      patch.last_minute_deals_enabled = body.last_minute_deals_enabled;
    }
    if (body.weekly_summary_enabled !== undefined) {
      patch.weekly_summary_enabled = body.weekly_summary_enabled;
    }
    if ('quiet_hours_from' in body)
      patch.quiet_hours_from = body.quiet_hours_from ?? null;
    if ('quiet_hours_to' in body)
      patch.quiet_hours_to = body.quiet_hours_to ?? null;

    const row = await this.me.updateNotificationPreferences(user.id, patch);
    return {
      notification_preferences: row
        ? MeMapper.toNotificationPreferencesDto(row)
        : null,
    };
  }

  /**
   * `GET /me/marketing-preferences`.
   *
   * THE THIRD PREFERENCE ROW, AND NOT A FOURTH SETTINGS SCREEN. There are two
   * other preference tables in the system and they answer different questions:
   * `consumer_notification_preferences` (`/me/notification-preferences`) is
   * about CHANNELS and quiet hours, and `business_notification_preferences` is
   * the merchant-side counterpart of that one. `marketing_preferences` is about
   * CAMPAIGN SUBSCRIPTION — may `EmailMarketingRepository` put this person in a
   * segment at all — so it is a different row on a different route, and the
   * name is deliberately close to the other two because the pairing is real.
   *
   * A MISSING ROW IS `null`, and that is this module's standing rule rather than
   * a new decision: the row is created by a one-off backfill in the
   * email-marketing migration (`insert ... select from profiles ... on conflict
   * do nothing`) and by the upsert below, and there is no signup trigger, so an
   * account created since that migration legitimately has none. Inventing it on
   * a read would make this a second source of truth for a table whose creation
   * the API does not own — and it would do it on a GET, which is not a place to
   * write. What the column defaults would have said is not invented either: the
   * PATCH is the moment the API starts writing this row, and its answer is the
   * stored one.
   */
  async getMarketingPreferences(
    user: AuthUser,
  ): Promise<MeMarketingPreferencesDto> {
    const row = await this.me.findMarketingPreferences(user.id);
    return {
      marketing_preferences: row
        ? MeMapper.toMarketingPreferencesDto(row)
        : null,
    };
  }

  /**
   * `PATCH /me/marketing-preferences`.
   *
   * ONLY TWO COLUMNS CROSS THE BORDER, and the three that do not are the
   * interesting part of this method:
   *
   *  - `unsubscribed_at` is STAMPED BY THE SERVER, in the repository, on the
   *    transition. It is the compliance-visible half of an unsubscribe — the
   *    column an auditor reads to answer "when did this person stop receiving
   *    our campaigns" — and a value the caller supplied would be a
   *    caller-supplied audit record. This is the position the rest of the
   *    codebase already takes: `EmailMarketingRepository.unsubscribe` (footer
   *    link) and `AuthAccountRepository` (account anonymisation) both write
   *    `new Date()`. The one writer that does not is mobile's PostgREST upsert,
   *    which is exactly the weakness this route removes.
   *  - `source` is the server's to write, for the same reason and because
   *    provenance claimed by the subject of the record is not provenance.
   *  - `updated_at` follows the row.
   *
   * `is_subscribed` and `categories` are independently optional and a PATCH
   * that sets either leaves the other exactly as stored, so a client that only
   * renders a master switch does not have to restate the category list — and a
   * restatement that dropped a category would silently unsubscribe the person
   * from it.
   */
  async updateMarketingPreferences(
    user: AuthUser,
    body: UpdateMyMarketingPreferencesDto,
  ): Promise<MeMarketingPreferencesDto> {
    const patch: MyMarketingPreferencesPatch = {};
    if (body.is_subscribed !== undefined) {
      patch.is_subscribed = body.is_subscribed;
    }
    if (body.categories !== undefined) patch.categories = body.categories;

    const row = await this.me.upsertMarketingPreferences(user.id, patch);
    return {
      marketing_preferences: row
        ? MeMapper.toMarketingPreferencesDto(row)
        : null,
    };
  }

  /**
   * `GET /me/order-stats` — mirror of `public.user_order_stats(p_user_id)`.
   *
   * THE ONLY ARGUMENT IS THE CALLER. The SQL function takes the user's id as a
   * parameter, and that is safe in Supabase only because it runs under the
   * caller's own RLS. There is no RLS in this request path — the API connects
   * as the `postgres` pooler role, which OWNS `orders` and is exempt from every
   * policy on it — so an id from a body or a query string here would be an
   * unchecked read of another account's history. The scoping is the `where
   * user_id = $1` inside `MeRepository.userOrderStats` and nothing else.
   *
   * The rule this reports is the function's, not this method's: everything that
   * is not `cancelled` counts, and a cancelled-but-never-completed order still
   * contributes its saving. See `MeRepository.userOrderStats`.
   */
  async getOrderStats(user: AuthUser): Promise<UserOrderStatsResponseDto> {
    const row = await this.me.userOrderStats(user.id);
    return { order_stats: MeMapper.toUserOrderStatsDto(row) };
  }

  async listConsents(user: AuthUser): Promise<UserConsentDto[]> {
    const rows = await this.me.listConsents(user.id);
    return MeMapper.toConsentListDtos(rows);
  }

  /**
   * `PUT /me/consents` — idempotent, keyed on the DECLARED union.
   *
   * `consent_type` is a member of `CONSENT_TYPES` because `ConsentTypeSchema`
   * says so, and the column has no CHECK to say it for us. The timestamp
   * bookkeeping that makes a repeated PUT a no-op lives in the repository's
   * `ON CONFLICT` clause.
   */
  async putConsent(
    user: AuthUser,
    body: UpsertMyConsentDto,
  ): Promise<UserConsentDto> {
    const row = await this.me.upsertConsent(
      user.id,
      body.consent_type,
      body.granted,
    );
    if (!row) {
      throw new NotFoundException('Consent not found');
    }
    return MeMapper.toConsentDto(row);
  }

  /**
   * `POST /me/devices` — register a push token, transferring ownership when the
   * same device arrives under a different account.
   *
   * The transfer is the repository's `ON CONFLICT (token) DO UPDATE`; what lives
   * here is the consequence: a token changing hands is the one event on this
   * surface that is worth a line in the log, and it is worth one WITHOUT the
   * token in it. A push token is a device-held secret (`docs/operations.md`
   * bans raw secrets in logs) and the ownership pair already says everything an
   * operator needs: which account took a device over from which.
   */
  async registerDevice(
    user: AuthUser,
    body: RegisterMyDeviceDto,
  ): Promise<DeviceTokenDto> {
    const { row, previousUserId } = await this.me.registerDevice({
      userId: user.id,
      token: body.token,
      platform: body.platform,
      deviceInfo: body.device_info,
    });

    if (previousUserId !== null && previousUserId !== user.id) {
      this.logger.warn({
        event: 'device_token_transferred',
        userId: user.id,
        previousUserId,
        platform: body.platform,
      });
    }

    return MeMapper.toDeviceTokenDto(row);
  }

  /**
   * `DELETE /me/devices` — revoke one of my push tokens, by token.
   *
   * Always 204, including for a token this caller never owned: a revoke is the
   * client's way of saying "stop sending to this device", and answering 404 for
   * a token it is trying to stop receiving from would turn a sign-out into a
   * failure the client has to handle. The repository scopes the update to the
   * caller, so a token that has since been transferred away is simply not found
   * — and the previous owner cannot reach the new owner's device.
   */
  async revokeDevice(user: AuthUser, token: string): Promise<void> {
    await this.me.revokeDevice(user.id, token);
  }
}
