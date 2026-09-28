import { describe, expect, test } from 'bun:test';
import {
  CouponMapper,
  toCouponDto,
  toCouponInsert,
  toCouponListItem,
  toCouponUpdate,
  toCouponValidation,
} from './coupons.mapper';
import type { CouponListRow, CouponRow } from './coupons.repository';

const makeRow = (overrides: Partial<CouponRow> = {}): CouponRow =>
  ({
    id: 'c1',
    business_id: 'b1',
    code: 'DESC10',
    name: 'Descuento 10',
    type: 'percentage',
    value: '10',
    min_order_amount: '5000',
    max_uses: 100,
    used_count: 3,
    is_active: true,
    expires_at: new Date('2025-12-31T00:00:00Z'),
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-02T00:00:00Z'),
    ...overrides,
  }) as CouponRow;

describe('toCouponDto', () => {
  test('mapea numéricos y fechas', () => {
    const dto = toCouponDto(makeRow());
    expect(dto.value).toBe(10);
    expect(dto.min_order_amount).toBe(5000);
    expect(dto.expires_at).toBe('2025-12-31T00:00:00.000Z');
    expect(dto.code).toBe('DESC10');
  });

  test('nulos se preservan', () => {
    const dto = toCouponDto(
      makeRow({ business_id: null, min_order_amount: null, expires_at: null }),
    );
    expect(dto.business_id).toBeNull();
    expect(dto.min_order_amount).toBeNull();
    expect(dto.expires_at).toBeNull();
  });
});

describe('toCouponListItem', () => {
  test('agrega business_name', () => {
    const item = toCouponListItem({
      ...makeRow(),
      business_name: 'Panadería',
    } as CouponListRow);
    expect(item.business_name).toBe('Panadería');
    expect(item.code).toBe('DESC10');
  });
});

describe('toCouponInsert', () => {
  test('convierte montos a string y defaultea is_active', () => {
    expect(
      toCouponInsert({
        code: 'X',
        name: 'N',
        type: 'fixed',
        value: 1500,
      }),
    ).toEqual({
      business_id: null,
      code: 'X',
      name: 'N',
      type: 'fixed',
      value: '1500',
      min_order_amount: null,
      max_uses: null,
      is_active: true,
      expires_at: null,
    });
  });

  test('respeta expires_at y min_order_amount', () => {
    const out = toCouponInsert({
      code: 'X',
      name: 'N',
      type: 'fixed',
      value: 1500,
      min_order_amount: 2000,
      expires_at: '2025-06-01T00:00:00.000Z',
    });
    expect(out.min_order_amount).toBe('2000');
    expect(out.expires_at).toEqual(new Date('2025-06-01T00:00:00.000Z'));
  });
});

describe('toCouponUpdate', () => {
  test('null limpia, undefined omite', () => {
    expect(
      toCouponUpdate({ min_order_amount: null, expires_at: null }),
    ).toEqual({ min_order_amount: null, expires_at: null });
    expect(toCouponUpdate({})).toEqual({});
    expect(toCouponUpdate({ value: 5 })).toEqual({ value: '5' });
  });
});

describe('toCouponValidation', () => {
  test('aceptado expone el dinero y el código consultado', () => {
    expect(
      toCouponValidation(
        { status: 'accepted', couponId: 'c1', discount: 399, finalPrice: 3591 },
        'DESC10',
      ),
    ).toEqual({
      applies: true,
      code: 'DESC10',
      discount: 399,
      final_price: 3591,
    });
  });

  // `orders.price` is `numeric(12,2)`, so the DB rounds what the evaluator
  // computes. The wire number has to be the stored one: quoting the raw float
  // would put 2660.1330000000003 on the checkout screen and 2660.13 on the
  // receipt, which is the bug this endpoint exists to remove.
  test('el dinero se redondea a la escala de orders.price', () => {
    expect(
      toCouponValidation(
        {
          status: 'accepted',
          couponId: 'c1',
          discount: 1329.8670000000003,
          finalPrice: 2660.1330000000003,
        },
        'PROMO',
      ),
    ).toEqual({
      applies: true,
      code: 'PROMO',
      discount: 1329.87,
      final_price: 2660.13,
    });
  });

  test('rechazado por etapa de revisión lleva code y reason', () => {
    expect(
      toCouponValidation(
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'wrong_business',
        },
        'DESC10',
      ),
    ).toEqual({
      applies: false,
      code: 'DESC10',
      error: 'COUPON_NOT_APPLICABLE',
      reason: 'wrong_business',
    });
  });

  // `reason` must be ABSENT, not undefined: the contract makes it optional
  // precisely because these two codes have no review stage of their own.
  test('rechazado por max_uses o min_order_amount no inventa reason', () => {
    for (const code of ['COUPON_EXHAUSTED', 'COUPON_MIN_NOT_MET'] as const) {
      const out = toCouponValidation({ status: 'rejected', code }, 'DESC10');
      expect(out).toEqual({ applies: false, code: 'DESC10', error: code });
      expect('reason' in out).toBe(false);
    }
  });

  test('nunca filtra la fila del cupón', () => {
    const out = toCouponValidation(
      { status: 'accepted', couponId: 'c1', discount: 10, finalPrice: 90 },
      'DESC10',
    );
    // Everything the coupon row holds beyond the applied discount is back
    // office material: name, redemption count, scope, expiry.
    expect(Object.keys(out).sort()).toEqual([
      'applies',
      'code',
      'discount',
      'final_price',
    ]);
  });
});

describe('CouponMapper', () => {
  test('expone los conversores', () => {
    expect(CouponMapper.toDto).toBe(toCouponDto);
    expect(CouponMapper.toListItem).toBe(toCouponListItem);
    expect(CouponMapper.toInsert).toBe(toCouponInsert);
    expect(CouponMapper.toUpdate).toBe(toCouponUpdate);
    expect(CouponMapper.toValidation).toBe(toCouponValidation);
  });
});
