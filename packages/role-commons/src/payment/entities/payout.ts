import type { PayoutStatus } from '../enums/payout-status';

/** Row shape for `public.payouts` */
export interface Payout {
  id: string;
  business_id: string;
  /** ISO date `YYYY-MM-DD` */
  period_start: string;
  /** ISO date `YYYY-MM-DD` */
  period_end: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: PayoutStatus;
  gateway_payout_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}
