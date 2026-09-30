import { ConflictException } from '@nestjs/common';
import type {
  CouponRejectionReason,
  CouponValidationErrorCode,
} from '@0xc1x/role-commons';
import type { CouponRow } from './coupons.repository';

/**
 * THE coupon rules, in one place.
 *
 * `POST /orders` (the mirror of the `reserve_offer` RPC, ADR-0008) and
 * `POST /coupons/validate` both call this. That is the entire point: the
 * reservation is the only authority on whether a coupon applies, and a
 * pre-check that answers differently is worse than no pre-check at all, because
 * it green-lights a code that the submit then rejects after the user has filled
 * in checkout. Duplicating the stages into a second implementation is the
 * failure mode this file exists to make impossible.
 *
 * The stage order IS the contract, and it is the RPC's:
 *
 *   1. not_found        the code resolves to nothing at all
 *   2. wrong_business   the resolved coupon belongs to another business
 *   3. inactive         `is_active` is false
 *   4. expired          `expires_at <= now`
 *   5. COUPON_EXHAUSTED `used_count >= max_uses`
 *   6. COUPON_MIN_NOT_MET `min_order_amount > amount`
 *   7. apply            percentage capped at the price, then `max(price - discount, 0)`
 *
 * Order matters when a coupon fails more than one stage: a coupon that is BOTH
 * scoped to another business AND inactive is a `wrong_business`, because that is
 * the first thing a caller can act on, and the reservation has always said so.
 *
 * `now` is a parameter, not `new Date()`, so expiry is testable without freezing
 * the clock and so both callers evaluate the same instant. The function is PURE:
 * no clock, no database, no `used_count` increment, no lock. The reservation
 * consumes `max_uses`; this only reports whether the coupon would apply.
 */

export type CouponEvaluationRejected =
  | {
      status: 'rejected';
      code: 'COUPON_NOT_APPLICABLE';
      reason: CouponRejectionReason;
    }
  | { status: 'rejected'; code: 'COUPON_EXHAUSTED' }
  | { status: 'rejected'; code: 'COUPON_MIN_NOT_MET' };

export type CouponEvaluationAccepted = {
  status: 'accepted';
  couponId: string;
  discount: number;
  /** The price the reservation will charge, coupons included. */
  finalPrice: number;
};

export type CouponEvaluation =
  CouponEvaluationRejected | CouponEvaluationAccepted;

/**
 * The exact `ConflictException` messages the reservation has always thrown, one
 * per stage. Spanish and unpunctuated accents included: existing specs assert
 * these strings and the SQL contract emits the same vocabulary, so translating
 * them is a breaking change dressed as a cleanup.
 *
 * Keyed by the shared `CouponRejectionReason` rather than by a local union, so
 * a new reason cannot land here without also landing in the contract.
 */
export const COUPON_REJECTION_MESSAGES: Readonly<
  Record<CouponRejectionReason, string>
> = {
  not_found: 'COUPON_NOT_APPLICABLE: not_found - El cupon no existe',
  wrong_business:
    'COUPON_NOT_APPLICABLE: wrong_business - El cupon pertenece a otro negocio',
  inactive: 'COUPON_NOT_APPLICABLE: inactive - El cupon esta inactivo',
  expired: 'COUPON_NOT_APPLICABLE: expired - El cupon ya vencio',
};

/** Stages 5 and 6 predate `COUPON_REJECTION_REASONS` and keep their own wording. */
const COUPON_STAGE_MESSAGES: Readonly<
  Record<Exclude<CouponValidationErrorCode, 'COUPON_NOT_APPLICABLE'>, string>
> = {
  COUPON_EXHAUSTED: 'COUPON_EXHAUSTED: Cupon agotado',
  COUPON_MIN_NOT_MET:
    'COUPON_MIN_NOT_MET: Monto minimo no alcanzado para el cupon',
};

/**
 * The throwing boundary, kept next to the rules so a caller cannot pick a
 * message of its own. `POST /coupons/validate` does NOT use this: a pre-check
 * reports the rejection in its body, because the client is mid-checkout and
 * needs the code, not a 409.
 */
export function couponRejectionException(
  rejection: CouponEvaluationRejected,
): ConflictException {
  if (rejection.code === 'COUPON_NOT_APPLICABLE') {
    return new ConflictException(COUPON_REJECTION_MESSAGES[rejection.reason]);
  }
  return new ConflictException(COUPON_STAGE_MESSAGES[rejection.code]);
}

/**
 * Resolve a coupon against one offer, or explain why it cannot be applied.
 *
 * `coupon` is the row the SHARED resolution ranked first (see
 * `coupon-resolution.ts`): this function does not choose WHICH row answers to a
 * code, and a caller that resolved a different row than the reservation would
 * make the two disagree no matter how correct these stages are.
 */
export function evaluateCoupon(
  coupon: CouponRow | null,
  context: { businessId: string; amount: number; now: Date },
): CouponEvaluation {
  const { businessId, amount, now } = context;

  if (!coupon) {
    return {
      status: 'rejected',
      code: 'COUPON_NOT_APPLICABLE',
      reason: 'not_found',
    };
  }

  // A `null` business_id is a platform-wide coupon, not an unowned one: it is
  // the fallback of the resolution order and applies to any business.
  if (coupon.business_id !== null && coupon.business_id !== businessId) {
    return {
      status: 'rejected',
      code: 'COUPON_NOT_APPLICABLE',
      reason: 'wrong_business',
    };
  }

  if (!coupon.is_active) {
    return {
      status: 'rejected',
      code: 'COUPON_NOT_APPLICABLE',
      reason: 'inactive',
    };
  }

  // `<=`, not `<`: a coupon whose expiry is the current instant is already gone.
  if (coupon.expires_at && coupon.expires_at <= now) {
    return {
      status: 'rejected',
      code: 'COUPON_NOT_APPLICABLE',
      reason: 'expired',
    };
  }

  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { status: 'rejected', code: 'COUPON_EXHAUSTED' };
  }

  // `?? 0`, so a coupon with no minimum is not rejected by `null > price`
  // coercion weirdness and a zero minimum is never "not met".
  if (Number(coupon.min_order_amount ?? 0) > amount) {
    return { status: 'rejected', code: 'COUPON_MIN_NOT_MET' };
  }

  const discount =
    coupon.type === 'percentage'
      ? Math.min((amount * Number(coupon.value)) / 100, amount)
      : Math.min(Number(coupon.value), amount);

  return {
    status: 'accepted',
    couponId: coupon.id,
    discount,
    finalPrice: Math.max(amount - discount, 0),
  };
}
