import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUPON_REJECTION_MESSAGES,
  couponRejectionException,
  evaluateCoupon,
  type CouponEvaluation,
} from './coupon-evaluator';
import type { CouponRow } from './coupons.repository';

const BUSINESS = '11111111-1111-1111-1111-111111111111';
const OTHER_BUSINESS = '22222222-2222-2222-2222-222222222222';
const COUPON_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-03-01T12:00:00.000Z');
const AMOUNT = 1000;

const makeCoupon = (overrides: Partial<CouponRow> = {}): CouponRow => ({
  id: COUPON_ID,
  business_id: BUSINESS,
  code: 'PROMO10',
  name: 'Promo',
  type: 'percentage',
  value: '10',
  min_order_amount: null,
  max_uses: null,
  used_count: 0,
  is_active: true,
  expires_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const judge = (
  coupon: CouponRow | null,
  context: { businessId?: string; amount?: number; now?: Date } = {},
): CouponEvaluation =>
  evaluateCoupon(coupon, {
    businessId: context.businessId ?? BUSINESS,
    amount: context.amount ?? AMOUNT,
    now: context.now ?? NOW,
  });

/**
 * The rules, exhaustively, in one place.
 *
 * `POST /coupons/validate` is only trustworthy while this function is the only
 * implementation of the stages, so the table below is the contract both paths
 * are measured against. Every stage has a single-fault row AND appears in at
 * least one multi-fault row: a coupon that is inactive AND scoped to another
 * business must be reported as `wrong_business`, and that is a property of the
 * ORDER of the stages, not of any one of them. Dropping a stage, reordering two
 * of them or copying them into a second function breaks a row here.
 */
describe('evaluateCoupon', () => {
  describe('one fault at a time', () => {
    it.each([
      [
        'no coupon at all',
        null,
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'not_found',
        },
      ],
      [
        'scoped to another business',
        makeCoupon({ business_id: OTHER_BUSINESS }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'wrong_business',
        },
      ],
      [
        'deactivated',
        makeCoupon({ is_active: false }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'inactive',
        },
      ],
      [
        'expired an hour ago',
        makeCoupon({ expires_at: new Date('2026-03-01T11:00:00.000Z') }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'expired',
        },
      ],
      [
        'exhausted exactly at max_uses',
        makeCoupon({ max_uses: 3, used_count: 3 }),
        { status: 'rejected', code: 'COUPON_EXHAUSTED' },
      ],
      [
        'one short of max_uses',
        makeCoupon({ max_uses: 3, used_count: 4 }),
        { status: 'rejected', code: 'COUPON_EXHAUSTED' },
      ],
      [
        'below min_order_amount',
        makeCoupon({ min_order_amount: '1000.01' }),
        { status: 'rejected', code: 'COUPON_MIN_NOT_MET' },
      ],
    ] as const)('rejects a coupon that is %s', (_name, coupon, expected) => {
      expect(judge(coupon as CouponRow | null)).toEqual(expected);
    });

    it.each([
      [
        'a global coupon applies to any business',
        makeCoupon({ business_id: null }),
        { businessId: OTHER_BUSINESS },
      ],
      [
        'a coupon with no minimum is never "not met"',
        makeCoupon({ min_order_amount: null }),
        {},
      ],
      [
        'a coupon with a zero minimum is never "not met"',
        makeCoupon({ min_order_amount: '0' }),
        {},
      ],
      [
        'a coupon with no redemption cap is never exhausted',
        makeCoupon({ max_uses: null, used_count: 999 }),
        {},
      ],
      [
        'a coupon with no expiry never expires',
        makeCoupon({ expires_at: null }),
        {},
      ],
      [
        'an amount exactly at min_order_amount applies',
        makeCoupon({ min_order_amount: '1000' }),
        {},
      ],
      [
        'one redemption left applies',
        makeCoupon({ max_uses: 3, used_count: 2 }),
        {},
      ],
      [
        'an expiry one millisecond ahead still applies',
        makeCoupon({ expires_at: new Date('2026-03-01T12:00:00.001Z') }),
        {},
      ],
    ] as const)('accepts %s', (_name, coupon, context) => {
      const evaluation = judge(coupon as CouponRow, context as object);

      expect(evaluation).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 100,
        finalPrice: 900,
      });
    });
  });

  describe('several faults at once: the stage order decides', () => {
    it.each([
      [
        'wrong_business outranks inactive, expired and exhausted',
        makeCoupon({
          business_id: OTHER_BUSINESS,
          is_active: false,
          expires_at: new Date('2000-01-01T00:00:00.000Z'),
          max_uses: 1,
          used_count: 1,
        }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'wrong_business',
        },
      ],
      [
        'inactive outranks expired and exhausted',
        makeCoupon({
          is_active: false,
          expires_at: new Date('2000-01-01T00:00:00.000Z'),
          max_uses: 1,
          used_count: 1,
        }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'inactive',
        },
      ],
      [
        'expired outranks exhausted and min not met',
        makeCoupon({
          expires_at: new Date('2000-01-01T00:00:00.000Z'),
          max_uses: 1,
          used_count: 1,
          min_order_amount: '99999',
        }),
        {
          status: 'rejected',
          code: 'COUPON_NOT_APPLICABLE',
          reason: 'expired',
        },
      ],
      [
        'exhausted outranks min not met',
        makeCoupon({ max_uses: 1, used_count: 1, min_order_amount: '99999' }),
        { status: 'rejected', code: 'COUPON_EXHAUSTED' },
      ],
    ] as const)('%s', (_name, coupon, expected) => {
      expect(judge(coupon as CouponRow)).toEqual(expected);
    });
  });

  describe('the applied discount', () => {
    it('takes a percentage of the amount', () => {
      expect(judge(makeCoupon({ value: '25' }))).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 250,
        finalPrice: 750,
      });
    });

    it('caps a percentage at the amount instead of going negative', () => {
      // The contract caps `value` at 100 for percentages, so this row cannot be
      // written through the API. The evaluator still refuses to produce a
      // negative price from one, because a negative `final_price` would be
      // shown to the user as a payable amount.
      expect(judge(makeCoupon({ value: '150' }))).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 1000,
        finalPrice: 0,
      });
    });

    it('takes a fixed value verbatim', () => {
      expect(judge(makeCoupon({ type: 'fixed', value: '300' }))).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 300,
        finalPrice: 700,
      });
    });

    it('caps a fixed value at the amount', () => {
      expect(judge(makeCoupon({ type: 'fixed', value: '5000' }))).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 1000,
        finalPrice: 0,
      });
    });

    it('never returns a price below zero', () => {
      for (const amount of [0, 1, 999.99]) {
        const evaluation = judge(makeCoupon({ type: 'fixed', value: '5000' }), {
          amount,
        });
        expect(evaluation.status).toBe('accepted');
        if (evaluation.status === 'accepted') {
          expect(evaluation.finalPrice).toBe(0);
          expect(evaluation.discount).toBe(amount);
        }
      }
    });
  });

  describe('now is a parameter, not a hidden clock', () => {
    it('judges expiry against the instant it was handed', () => {
      const expiring = makeCoupon({
        expires_at: new Date('2026-03-01T12:00:00.000Z'),
      });

      // The expiry IS `now`: `<=`, not `<`. A coupon whose expiry is the current
      // instant is already gone, and the reservation has always said so.
      expect(
        judge(expiring, { now: new Date('2026-03-01T11:59:59.999Z') }),
      ).toEqual({
        status: 'accepted',
        couponId: COUPON_ID,
        discount: 100,
        finalPrice: 900,
      });
      expect(
        judge(expiring, { now: new Date('2026-03-01T12:00:00.000Z') }),
      ).toEqual({
        status: 'rejected',
        code: 'COUPON_NOT_APPLICABLE',
        reason: 'expired',
      });
    });
  });

  describe('purity: the evaluator touches nothing', () => {
    it('returns the same verdict for the same inputs and mutates no row', () => {
      const coupon = makeCoupon({ max_uses: 1, used_count: 0 });
      const before = { ...coupon };

      const first = judge(coupon);
      const second = judge(coupon);

      expect(first).toEqual(second);
      expect(coupon).toEqual(before);
      // `used_count` is the reservation's to spend. An evaluator that consumed
      // it would exhaust a coupon on a screen the user can walk away from.
      expect(coupon.used_count).toBe(0);
    });
  });
});

/**
 * The messages are contract, not wording. `POST /orders` has always thrown
 * these exact strings, existing specs assert them and the SQL contract emits the
 * same vocabulary, so a rewrite of any of them is a breaking change.
 */
describe('the rejection messages the reservation throws', () => {
  it.each([
    ['not_found', 'COUPON_NOT_APPLICABLE: not_found - El cupon no existe'],
    [
      'wrong_business',
      'COUPON_NOT_APPLICABLE: wrong_business - El cupon pertenece a otro negocio',
    ],
    ['inactive', 'COUPON_NOT_APPLICABLE: inactive - El cupon esta inactivo'],
    ['expired', 'COUPON_NOT_APPLICABLE: expired - El cupon ya vencio'],
  ] as const)('%s', (reason, message) => {
    expect(COUPON_REJECTION_MESSAGES[reason]).toBe(message);
    expect(
      couponRejectionException({
        status: 'rejected',
        code: 'COUPON_NOT_APPLICABLE',
        reason,
      }).message,
    ).toBe(message);
  });

  it('keeps the two later stages on their own wording', () => {
    expect(
      couponRejectionException({ status: 'rejected', code: 'COUPON_EXHAUSTED' })
        .message,
    ).toBe('COUPON_EXHAUSTED: Cupon agotado');
    expect(
      couponRejectionException({
        status: 'rejected',
        code: 'COUPON_MIN_NOT_MET',
      }).message,
    ).toBe('COUPON_MIN_NOT_MET: Monto minimo no alcanzado para el cupon');
  });
});

/**
 * THE DRIFT GUARD.
 *
 * Everything above proves `evaluateCoupon` is correct. It cannot prove it is
 * the only implementation — a second copy of the stages inside a service can
 * agree with it on every fixture in this file and still drift the first time a
 * stage changes. So these tests read the two services and the two repositories
 * and assert that the decision is DELEGATED: the coupon rule fields appear
 * nowhere outside the evaluator, and both resolution reads order by the one
 * shared ranking.
 *
 * Comments are stripped first, because both services document the stage order
 * in prose and naming the fields there is the point. The four files below carry
 * no `//` or block comment inside a string literal, which is what makes a
 * textual scan safe here.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readSource(...segments: string[]): string {
  return stripComments(
    readFileSync(join(import.meta.dir, ...segments), 'utf8'),
  );
}

const ORDERS_SERVICE = readSource('../orders/orders.service.ts');
const COUPONS_SERVICE = readSource('./coupons.service.ts');
const ORDERS_REPOSITORY = readSource('../orders/orders.repository.ts');
const COUPONS_REPOSITORY = readSource('./coupons.repository.ts');

/** Rule fields that may only be read inside `coupon-evaluator.ts`. */
const RULE_FIELDS = ['expires_at', 'max_uses', 'min_order_amount'] as const;

describe('one implementation, not two', () => {
  it('the reservation delegates its coupon decision to the evaluator', () => {
    expect(ORDERS_SERVICE).toContain('evaluateCoupon(');
    expect(ORDERS_SERVICE).toContain('couponRejectionException(');
    for (const field of RULE_FIELDS) {
      expect(ORDERS_SERVICE).not.toContain(field);
    }
  });

  it('the pre-check delegates its coupon decision to the evaluator', () => {
    expect(COUPONS_SERVICE).toContain('evaluateCoupon(');
    // The pre-check must never throw the reservation's exception: a code the
    // user may not use is an answer, not a 409.
    expect(COUPONS_SERVICE).not.toContain('couponRejectionException(');
    for (const field of RULE_FIELDS) {
      expect(COUPONS_SERVICE).not.toContain(field);
    }
  });

  it('both resolution reads order by the one shared ranking', () => {
    expect(ORDERS_REPOSITORY).toContain('couponScopeRank(');
    expect(COUPONS_REPOSITORY).toContain('couponScopeRank(');
    // `then 0` is the fingerprint of the ranking expression. Inlined anywhere
    // else it is a second resolution, and a second resolution is how the
    // pre-check ends up approving a code the reservation rejects.
    expect(ORDERS_REPOSITORY).not.toContain('then 0');
    expect(COUPONS_REPOSITORY).not.toContain('then 0');
  });
});
