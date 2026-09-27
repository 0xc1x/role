import {
  CONSENT_TYPES,
  type ConsumerNotificationPreferencesDto,
  type DeviceTokenDto,
  type ProfileDto,
  type UserConsentDto,
  type UserPreferencesDto,
} from '@0xc1x/role-commons';
import type {
  ConsumerNotificationPreferencesRow,
  DeviceTokenRow,
  ProfileRow,
  UserConsentRow,
  UserPreferencesRow,
} from './me.repository';

/**
 * The declared consent union, as a lookup. `user_consents.consent_type` is a
 * bare `text` column with no CHECK, so a row written straight through PostgREST
 * (which mobile still does, ADR-0002) can hold a value this API's contract
 * cannot name. `UserConsentSchema.consent_type` is `ConsentTypeSchema`, so the
 * alternative to this set is asserting a type the row does not have.
 *
 * Dropping the row is the honest end of that: it is corrupt relative to the
 * contract, and the write path below can never produce one. It is also why the
 * consent list is filtered here and not in SQL — the filter IS the type guard,
 * and doing it in the query would need a generated `in` list of the same three
 * values for no gain.
 */
const DECLARED_CONSENT_TYPES = new Set<string>(CONSENT_TYPES);

/**
 * Row -> DTO for the `/me` surface. Five shapes, five methods, no database row
 * leaves the API untyped: every timestamp crosses the boundary as an ISO 8601
 * string and every enum leaves as a member of its declared union.
 */
export class MeMapper {
  static toProfileDto(row: ProfileRow): ProfileDto {
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      phone: row.phone,
      // Read, never written: the self-service schemas have no `role` key, so
      // this value can only have been set by signup, the trigger or the admin
      // controller.
      role: row.role,
      city: row.city,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toPreferencesDto(row: UserPreferencesRow): UserPreferencesDto {
    return {
      id: row.id,
      user_id: row.user_id,
      notification_radius_km: row.notification_radius_km,
      // The column is nullable; the empty list and NULL are both "no
      // favourites" and neither is a lie the caller has to special-case.
      favorite_categories: row.favorite_categories,
      language: row.language,
      theme_mode: row.theme_mode as UserPreferencesDto['theme_mode'],
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toNotificationPreferencesDto(
    row: ConsumerNotificationPreferencesRow,
  ): ConsumerNotificationPreferencesDto {
    return {
      user_id: row.user_id,
      push_enabled: row.push_enabled,
      email_enabled: row.email_enabled,
      sms_enabled: row.sms_enabled,
      whatsapp_enabled: row.whatsapp_enabled,
      favorite_alerts_enabled: row.favorite_alerts_enabled,
      pickup_reminders_enabled: row.pickup_reminders_enabled,
      last_minute_deals_enabled: row.last_minute_deals_enabled,
      weekly_summary_enabled: row.weekly_summary_enabled,
      // `time` (not `timestamp`): the column crosses the wire as Postgres
      // already formats it, 'HH:MM:SS', which is what `TimeSchema` accepts.
      quiet_hours_from: row.quiet_hours_from,
      quiet_hours_to: row.quiet_hours_to,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toConsentDto(row: UserConsentRow): UserConsentDto {
    return {
      id: row.id,
      user_id: row.user_id,
      consent_type: row.consent_type as UserConsentDto['consent_type'],
      granted: row.granted,
      granted_at: row.granted_at?.toISOString() ?? null,
      revoked_at: row.revoked_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toConsentListDtos(rows: UserConsentRow[]): UserConsentDto[] {
    return rows
      .filter((row) => DECLARED_CONSENT_TYPES.has(row.consent_type))
      .map((row) => MeMapper.toConsentDto(row));
  }

  static toDeviceTokenDto(row: DeviceTokenRow): DeviceTokenDto {
    return {
      id: row.id,
      user_id: row.user_id,
      token: row.token,
      platform: row.platform,
      device_info: row.device_info,
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
