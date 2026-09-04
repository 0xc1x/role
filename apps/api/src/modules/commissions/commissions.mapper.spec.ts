import { describe, expect, test } from 'bun:test';
import { CommissionMapper } from './commissions.mapper';

describe('CommissionMapper.toDto', () => {
  test('mapea proyección completa', () => {
    expect(
      CommissionMapper.toDto({
        id: 'biz-1',
        name: 'Panadería',
        slug: 'panaderia',
        commission_rate: '12.5',
        is_active: true,
        updated_at: new Date('2025-01-01T00:00:00Z'),
        has_pending_payouts: false,
      }),
    ).toEqual({
      id: 'biz-1',
      name: 'Panadería',
      slug: 'panaderia',
      commission_rate: 12.5,
      active: true,
      has_pending_payouts: false,
      updated_at: '2025-01-01T00:00:00.000Z',
    });
  });

  test('commission_rate nulo → 0', () => {
    const dto = CommissionMapper.toDto({
      id: 'biz-1',
      name: 'N',
      slug: 'n',
      commission_rate: null,
      is_active: false,
      updated_at: new Date('2025-01-01T00:00:00Z'),
      has_pending_payouts: true,
    });
    expect(dto.commission_rate).toBe(0);
    expect(dto.has_pending_payouts).toBe(true);
  });
});
