import type { OrderStatus } from '@0xc1x/role-commons';
import { toNumber } from '../../common/utils/numeric';
import { canViewPickupCode } from './order-status.machine';
import type { orders as ordersTable } from '../../database/schema';

export type OrderRow = typeof ordersTable.$inferSelect;

export type OrderViewer = {
  isOrderOwner: boolean;
  isBusinessOwner: boolean;
  isAdmin: boolean;
};

/**
 * Order API response. `pickup_code` is null when the viewer must not see it
 * (business before ready_for_pickup, non-owners, etc.).
 */
export type OrderResponse = {
  id: string;
  user_id: string;
  offer_id: string;
  business_id: string;
  order_number: string;
  status: string;
  price: number;
  original_price: number;
  pickup_code: string | null;
  pickup_time: string | null;
  coupon_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Maps order persistence rows → API responses with pickup_code visibility rules.
 */
export class OrderMapper {
  static toResponse(row: OrderRow, viewer: OrderViewer): OrderResponse {
    const status = row.status as OrderStatus;
    const showPickupCode = canViewPickupCode({
      status,
      isOrderOwner: viewer.isOrderOwner,
      isBusinessOwner: viewer.isBusinessOwner,
      isAdmin: viewer.isAdmin,
    });

    return {
      id: row.id,
      user_id: row.user_id,
      offer_id: row.offer_id,
      business_id: row.business_id,
      order_number: row.order_number,
      status: row.status,
      price: toNumber(row.price),
      original_price: toNumber(row.original_price),
      pickup_code: showPickupCode ? row.pickup_code : null,
      pickup_time: row.pickup_time ? row.pickup_time.toISOString() : null,
      coupon_id: row.coupon_id,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
