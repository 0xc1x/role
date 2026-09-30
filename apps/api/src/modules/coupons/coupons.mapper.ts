import type {
  CouponDto,
  CouponListItemDto,
  CouponValidation,
  CreateCouponDto,
  UpdateCouponDto,
} from '@0xc1x/role-commons';
import { round2, toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  CouponEvaluation,
  CouponEvaluationRejected,
} from './coupon-evaluator';
import type {
  CouponInsert,
  CouponListRow,
  CouponRow,
  CouponUpdate,
} from './coupons.repository';

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function toCouponDto(row: CouponRow): CouponDto {
  return {
    id: row.id,
    business_id: row.business_id,
    code: row.code,
    name: row.name,
    type: row.type,
    value: toNumber(row.value),
    min_order_amount: toNumberOrNull(row.min_order_amount),
    max_uses: row.max_uses,
    used_count: row.used_count,
    is_active: row.is_active,
    expires_at: toIsoOrNull(row.expires_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function toCouponListItem(row: CouponListRow): CouponListItemDto {
  return { ...toCouponDto(row), business_name: row.business_name };
}

/**
 * The `POST /coupons/validate` verdict.
 *
 * Built from the shared evaluation, never from a raw row: this response is a
 * checkout answer, and everything the coupon row holds beyond the applied
 * discount — its name, its redemption count, its scope, its expiry — belongs to
 * the back office, not to whoever typed the code. `code` is echoed back so a
 * client holding a trimmed or mis-typed code can tell WHICH code was judged.
 *
 * A rejection carries `error` and, only for `COUPON_NOT_APPLICABLE`, `reason`:
 * the same shape the reservation reports, so one client branch handles both.
 */
export function toCouponValidation(
  evaluation: CouponEvaluation,
  code: string,
): CouponValidation {
  if (evaluation.status === 'accepted') {
    return {
      applies: true,
      code,
      // Rounded to the scale of `orders.price` (`numeric(12,2)`), because that
      // is the number the reservation will actually charge: a 33.33% coupon on
      // 3990 discounts 1329.867… and the order row stores 1329.87. Quoting the
      // raw float here would put `2660.1330000000003` on the checkout screen and
      // `2660.13` on the receipt — the exact "we told you one number and charged
      // another" this endpoint was built to end. The evaluator stays unrounded so
      // the reservation's own arithmetic (platform fee, net amount) is unchanged.
      discount: round2(evaluation.discount),
      final_price: round2(evaluation.finalPrice),
    };
  }
  return rejectionToValidation(evaluation, code);
}

function rejectionToValidation(
  rejection: CouponEvaluationRejected,
  code: string,
): CouponValidation {
  if (rejection.code === 'COUPON_NOT_APPLICABLE') {
    return {
      applies: false,
      code,
      error: rejection.code,
      reason: rejection.reason,
    };
  }
  // No `reason` key at all, not `reason: undefined`: the contract makes it
  // optional precisely because these two codes have no stage of their own.
  return { applies: false, code, error: rejection.code };
}

export function toCouponInsert(dto: CreateCouponDto): CouponInsert {
  return {
    business_id: dto.business_id ?? null,
    code: dto.code,
    name: dto.name,
    type: dto.type,
    value: String(dto.value),
    min_order_amount:
      dto.min_order_amount === null || dto.min_order_amount === undefined
        ? null
        : String(dto.min_order_amount),
    max_uses: dto.max_uses ?? null,
    is_active: dto.is_active ?? true,
    expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
  };
}

export function toCouponUpdate(dto: UpdateCouponDto): CouponUpdate {
  const update: CouponUpdate = {};
  if (dto.code !== undefined) update.code = dto.code;
  if (dto.name !== undefined) update.name = dto.name;
  if (dto.type !== undefined) update.type = dto.type;
  if (dto.value !== undefined) update.value = String(dto.value);
  if (dto.min_order_amount !== undefined) {
    update.min_order_amount =
      dto.min_order_amount === null ? null : String(dto.min_order_amount);
  }
  if (dto.max_uses !== undefined) update.max_uses = dto.max_uses;
  if (dto.is_active !== undefined) update.is_active = dto.is_active;
  if (dto.expires_at !== undefined) {
    update.expires_at =
      dto.expires_at === null ? null : new Date(dto.expires_at);
  }
  return update;
}

// backwards compat for tests
export const CouponMapper = {
  toDto: toCouponDto,
  toListItem: toCouponListItem,
  toInsert: toCouponInsert,
  toUpdate: toCouponUpdate,
  toValidation: toCouponValidation,
};
