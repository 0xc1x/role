import { describe, expect, it } from 'bun:test';
import { CreatePaymentMethodSchema } from '../schemas/payment-method.schema';
import { PayoutSchema } from '../schemas/payout.schema';

const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('CreatePaymentMethodSchema', () => {
  it('accepts tokenized card without PAN', () => {
    expect(
      CreatePaymentMethodSchema.safeParse({
        gateway_token: 'tok_abc',
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2030,
        holder_name: 'Ana López',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid last4', () => {
    expect(
      CreatePaymentMethodSchema.safeParse({
        gateway_token: 'tok',
        brand: 'visa',
        last4: '42',
        exp_month: 12,
        exp_year: 2030,
        holder_name: 'Ana',
      }).success,
    ).toBe(false);
  });
});

describe('PayoutSchema', () => {
  it('accepts valid payout row shape', () => {
    expect(
      PayoutSchema.safeParse({
        id: uuid,
        business_id: uuid,
        period_start: '2026-01-01',
        period_end: '2026-01-15',
        gross_amount: 100,
        platform_fee: 10,
        net_amount: 90,
        status: 'pending',
        gateway_payout_id: null,
        paid_at: null,
        created_at: '2026-01-16T00:00:00.000Z',
        updated_at: '2026-01-16T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
