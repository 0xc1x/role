import type { PayoutDto } from '@0xc1x/role-commons';
import type { PayoutRow, PayoutRowWithBusiness } from './payouts.repository';

export class PayoutMapper {
  static toDto(row: PayoutRow | PayoutRowWithBusiness): PayoutDto {
    return {
      id: row.id,
      business_id: row.business_id,
      business_name:
        (row as { business_name?: string | null }).business_name ?? null,
      period_start: row.period_start,
      period_end: row.period_end,
      gross_amount: Number(row.gross_amount),
      platform_fee: Number(row.platform_fee),
      net_amount: Number(row.net_amount),
      status: row.status,
      gateway_payout_id: row.gateway_payout_id,
      paid_at: row.paid_at ? row.paid_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
