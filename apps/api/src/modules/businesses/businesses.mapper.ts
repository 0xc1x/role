import type {
  BusinessDto,
  BusinessEmailSendDto,
  BusinessLocationDto,
  BusinessNotificationPreferencesDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  BusinessAggregateRow,
  BusinessEmailSendRow,
  BusinessLocationRow,
  BusinessNotificationPreferencesRow,
} from './businesses.repository';

/**
 * Maps business / location rows → API DTOs (numerics + ISO dates).
 *
 * The aggregate row is the business plus its three companions, so the DTO keeps
 * the flat shape it always had.
 */
export class BusinessMapper {
  static toDto(row: BusinessAggregateRow): BusinessDto {
    return {
      id: row.id,
      owner_id: row.owner_id,
      name: row.name,
      type: row.type,
      slug: row.slug,
      image: row.image,
      cover_image: row.cover_image,
      description: row.description,
      phone: row.phone,
      email: row.email,
      website: row.website,
      commission_rate: toNumberOrNull(row.commission_rate),
      balance: toNumberOrNull(row.balance),
      rating: toNumberOrNull(row.rating),
      review_count: row.review_count ?? null,
      is_active: row.is_active,
      verification_status:
        row.verification_status as BusinessDto['verification_status'],
      verified_at: row.verified_at ? row.verified_at.toISOString() : null,
      verified_by: row.verified_by ?? null,
      rejection_reason: row.rejection_reason ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  /**
   * Envío transaccional de un negocio → DTO. La fila se proyecta a los campos
   * que el operador necesita; `error_message` es null mientras el envío no ha
   * fallado (no un string vacío), para que la UI pueda distinguir "sin error"
   * de "falló sin mensaje".
   */
  static toEmailSendDto(row: BusinessEmailSendRow): BusinessEmailSendDto {
    return {
      id: row.id,
      email: row.email,
      template_name: row.template_name,
      status: row.status,
      error_message: row.error_message ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toNotificationPreferencesDto(
    row: BusinessNotificationPreferencesRow,
  ): BusinessNotificationPreferencesDto {
    return {
      business_id: row.business_id,
      push_enabled: row.push_enabled,
      email_enabled: row.email_enabled,
      sms_enabled: row.sms_enabled,
      whatsapp_enabled: row.whatsapp_enabled,
      new_orders_enabled: row.new_orders_enabled,
      pickup_ready_enabled: row.pickup_ready_enabled,
      reviews_enabled: row.reviews_enabled,
      low_stock_enabled: row.low_stock_enabled,
      daily_summary_enabled: row.daily_summary_enabled,
      // `time` (not `timestamp`): the column crosses the wire as Postgres
      // already formats it, 'HH:MM:SS', which is what `TimeSchema` accepts.
      // Same representation `MeMapper.toNotificationPreferencesDto` uses for the
      // consumer row, deliberately — the two DTOs are siblings and a client
      // that renders both should not have to know they came from different
      // tables.
      quiet_hours_from: row.quiet_hours_from,
      quiet_hours_to: row.quiet_hours_to,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toLocationDto(row: BusinessLocationRow): BusinessLocationDto {
    return {
      id: row.id,
      business_id: row.business_id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      is_active: row.is_active,
      zone: row.zone,
      is_headquarter: row.is_headquarter,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
