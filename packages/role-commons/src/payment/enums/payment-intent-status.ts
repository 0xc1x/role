export const PAYMENT_INTENT_STATUSES = [
  'pending',
  'processing',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
] as const;

export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PaymentIntentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const satisfies Record<string, PaymentIntentStatus>;
