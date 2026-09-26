import { describe, expect, test } from 'bun:test';
import type { OrderStatus } from '@0xc1x/role-commons';
import {
  isStuckOrder,
  OrderMapper,
  type OrderRow,
} from './orders.mapper';
import type { AdminOrderListRow } from './orders.repository';

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

const makeAdminRow = (
  overrides: Partial<AdminOrderListRow> = {},
): AdminOrderListRow => ({
  id: 'order-1',
  order_number: 'FD-2026-0101-001',
  status: 'pending',
  business_id: 'biz-1',
  business_name: 'Café Central',
  offer_id: 'offer-1',
  offer_title: 'Mesa de sobrantes',
  price: '9.99',
  original_price: '19.99',
  pickup_start: new Date('2025-01-01T10:00:00Z'),
  pickup_end: new Date('2025-01-01T18:00:00Z'),
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

describe('OrderMapper.toAdminListItem', () => {
  const now = new Date('2025-01-02T00:00:00Z');

  test('expone el nombre del negocio y la ventana de la oferta', () => {
    const res = OrderMapper.toAdminListItem(makeAdminRow(), now);
    expect(res.business_name).toBe('Café Central');
    expect(res.offer_title).toBe('Mesa de sobrantes');
    expect(res.pickup_start).toBe('2025-01-01T10:00:00.000Z');
    expect(res.pickup_end).toBe('2025-01-01T18:00:00.000Z');
    expect(res.price).toBe(9.99);
    expect(res.original_price).toBe(19.99);
  });

  // Allow-list: la fila de `orders` trae el id del consumidor (identidad de otro
  // tenant), el código de recogida (secreto) y los montos internos del negocio.
  // Ninguno pertenece a un listado de soporte y no deben colarse por defecto.
  test('no filtra el id del consumidor, el código de recogida ni los montos internos', () => {
    const res = OrderMapper.toAdminListItem(makeAdminRow(), now);
    expect(Object.keys(res).sort()).toEqual([
      'business_id',
      'business_name',
      'created_at',
      'id',
      'is_stuck',
      'offer_id',
      'offer_title',
      'order_number',
      'original_price',
      'pickup_end',
      'pickup_start',
      'price',
      'status',
      'updated_at',
    ]);
    const leaked = ['user_id', 'pickup_code', 'pickup_time', 'coupon_id'];
    for (const key of leaked) {
      expect(res).not.toHaveProperty(key);
    }
    for (const key of [
      'commission_rate',
      'platform_fee',
      'net_amount',
      'payout_id',
      'idempotency_key',
    ]) {
      expect(res).not.toHaveProperty(key);
    }
  });

  test('marca atascada la orden con la ventana cerrada y sin terminar', () => {
    const res = OrderMapper.toAdminListItem(
      makeAdminRow({ pickup_end: new Date('2024-12-31T18:00:00Z') }),
      now,
    );
    expect(res.is_stuck).toBe(true);
  });

  test.each<OrderStatus>(['completed', 'cancelled', 'expired'])(
    'no marca atascada una orden %s con la ventana cerrada (estado terminal)',
    (status) => {
      const res = OrderMapper.toAdminListItem(
        makeAdminRow({
          status,
          pickup_end: new Date('2024-12-31T18:00:00Z'),
        }),
        now,
      );
      expect(res.is_stuck).toBe(false);
    },
  );

  test('deja business_name en null si el join no resolvió', () => {
    const res = OrderMapper.toAdminListItem(
      makeAdminRow({ business_name: null }),
      now,
    );
    expect(res.business_name).toBeNull();
  });
});

describe('isStuckOrder', () => {
  const now = new Date('2025-01-02T00:00:00Z');
  const passed = new Date('2025-01-01T18:00:00Z');
  const future = new Date('2025-01-03T18:00:00Z');

  test('ventana cerrada + estado no terminal = atascada', () => {
    expect(isStuckOrder('pending', passed, now)).toBe(true);
    expect(isStuckOrder('picked_up', passed, now)).toBe(true);
  });

  test('ventana abierta o estado terminal = no atascada', () => {
    expect(isStuckOrder('pending', future, now)).toBe(false);
    expect(isStuckOrder('completed', passed, now)).toBe(false);
  });
});
