import { sql } from 'drizzle-orm';
import { coupons } from '../../database/schema';

/**
 * WHICH coupon answers to a code, shared by every read that resolves one.
 *
 * A code is not unique: `business_id = X` wins, a platform-wide coupon
 * (`business_id is null`) is the fallback, and a coupon belonging to some other
 * business ranks last so the stages can still report `wrong_business` when
 * nothing else can apply. That ranking is the resolution contract, and it is
 * duplicated nowhere: `OrdersRepository.findCouponByCodeForUpdate` (the
 * reservation, locking) and `CouponsRepository.findApplicableByCode` (the
 * checkout pre-check, non-locking) both ORDER BY this expression.
 *
 * Why one expression and not two that happen to agree: if the pre-check ranked
 * differently it could resolve the platform coupon while the reservation
 * resolved the business one, the pre-check would approve a code and the
 * reservation would reject it as `wrong_business` — the precise disagreement
 * this pre-check exists to remove, reintroduced through the read instead of
 * through the rules.
 *
 * The expression does not decide LOCKING. The reservation locks the row it
 * picked so `used_count` cannot race; the pre-check reserves nothing, so it
 * must not lock (see `CouponsRepository.findApplicableByCode`).
 */
export function couponScopeRank(businessId: string) {
  return sql`case
    when ${coupons.business_id} = ${businessId} then 0
    when ${coupons.business_id} is null then 1
    else 2
  end`;
}
