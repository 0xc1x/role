export const PAYMENT_GATEWAYS = ['place_to_pay', 'stripe'] as const;

export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PaymentGateway = {
  PLACE_TO_PAY: 'place_to_pay',
  STRIPE: 'stripe',
} as const satisfies Record<string, PaymentGateway>;
