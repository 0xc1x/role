import { describe, expect, test } from 'bun:test';
import { OrderMapper, type OrderRow } from './orders.mapper';

const makeRow = (overrides: Partial<OrderRow> = {}): OrderRow =>
  ({
    id: 'order-1',
    user_id: 'user-1',
    offer_id: 'offer-1',
    business_id: 'biz-1',
    order_number: 'R-0001',
    status: 'ready_for_pickup',
    price: '5000',
    original_price: '10000',
    pickup_code: 'ABC123',
    pickup_time: new Date('2025-01-10T18:00:00Z'),
    coupon_id: null,
    created_at: new Date('2025-01-09T00:00:00Z'),
    updated_at: new Date('2025-01-09T00:00:00Z'),
    ...overrides,
  }) as OrderRow;

describe('OrderMapper.toResponse', () => {
  test('dueño ve pickup_code', () => {
    const res = OrderMapper.toResponse(makeRow(), {
      isOrderOwner: true,
      isBusinessOwner: false,
      isAdmin: false,
    });
    expect(res.pickup_code).toBe('ABC123');
    expect(res.price).toBe(5000);
    expect(res.original_price).toBe(10000);
    expect(res.pickup_time).toBe('2025-01-10T18:00:00.000Z');
  });

  test('tercero no ve pickup_code', () => {
    const res = OrderMapper.toResponse(makeRow(), {
      isOrderOwner: false,
      isBusinessOwner: false,
      isAdmin: false,
    });
    expect(res.pickup_code).toBeNull();
  });

  test('admin siempre ve pickup_code', () => {
    const res = OrderMapper.toResponse(makeRow({ status: 'pending' }), {
      isOrderOwner: false,
      isBusinessOwner: false,
      isAdmin: true,
    });
    expect(res.pickup_code).toBe('ABC123');
  });
});
