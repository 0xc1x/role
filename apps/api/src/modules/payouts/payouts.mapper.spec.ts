import { describe, expect, test } from 'bun:test';
import { PayoutMapper } from './payouts.mapper';
import type { PayoutRow } from './payouts.repository';

const makeRow = (overrides: Partial<PayoutRow> = {}): PayoutRow =>
  ({
    id: 'pay-1',
    business_id: 'biz-1',
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    gross_amount: '100000',
    platform_fee: '12000',
    net_amount: '88000',
    status: 'pending',
    gateway_payout_id: null,
    paid_at: null,
    created_at: new Date('2025-01-16T00:00:00Z'),
    updated_at: new Date('2025-01-16T00:00:00Z'),
    ...overrides,
  }) as PayoutRow;

describe('PayoutMapper.toDto', () => {
  test('mapea montos y fechas', () => {
    const dto = PayoutMapper.toDto(makeRow());
    expect(dto.gross_amount).toBe(100000);
    expect(dto.platform_fee).toBe(12000);
    expect(dto.net_amount).toBe(88000);
    expect(dto.paid_at).toBeNull();
    expect(dto.business_name).toBeNull();
    expect(dto.created_at).toBe('2025-01-16T00:00:00.000Z');
  });

  test('incluye business_name y paid_at cuando vienen', () => {
    const dto = PayoutMapper.toDto({
      ...makeRow(),
      business_name: 'Panadería',
      status: 'paid',
      paid_at: new Date('2025-01-17T00:00:00Z'),
    });
    expect(dto.business_name).toBe('Panadería');
    expect(dto.paid_at).toBe('2025-01-17T00:00:00.000Z');
  });
});
