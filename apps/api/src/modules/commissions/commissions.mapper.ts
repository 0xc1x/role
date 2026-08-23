import type { CommissionDto } from '@0xc1x/role-commons';
import type { CommissionRow } from './commissions.repository';

/**
 * Maps commission projections (business rows) ↔ API DTOs.
 */
export class CommissionMapper {
  static toDto(row: CommissionRow): CommissionDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      commission_rate:
        row.commission_rate === null ? 0 : Number(row.commission_rate),
      active: row.is_active,
      has_pending_payouts: row.has_pending_payouts,
      updated_at: row.updated_at?.toISOString() ?? null,
    };
  }
}
