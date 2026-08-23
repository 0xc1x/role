/**
 * Domain entity for a business commission.
 * `commission_rate` is a fraction (0.1 = 10%). Timestamps are ISO-8601 strings.
 */
export interface Commission {
  id: string;
  name: string;
  slug: string;
  commission_rate: number;
  active: boolean;
  has_pending_payouts: boolean;
  updated_at: string | null;
}
