import type {
  CouponDto,
  CouponListItemDto,
  CreateCouponDto,
  UpdateCouponDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
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
    update.expires_at = dto.expires_at === null ? null : new Date(dto.expires_at);
  }
  return update;
}

// backwards compat for tests
export const CouponMapper = {
  toDto: toCouponDto,
  toListItem: toCouponListItem,
  toInsert: toCouponInsert,
  toUpdate: toCouponUpdate,
};
