export const PAYOUT_STATUSES = [
  'pending',
  'processing',
  'paid',
  'failed',
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PayoutStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
} as const satisfies Record<string, PayoutStatus>;
