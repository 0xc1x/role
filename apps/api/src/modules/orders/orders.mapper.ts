import type {
  AdminOrderListItemDto,
  OrderStatus,
} from '@0xc1x/role-commons';
import { toNumber } from '../../common/utils/numeric';
import { ACTIVE_ORDER_STATUSES, canViewPickupCode } from './order-status.machine';
import type { orders as ordersTable } from '../../database/schema';
import type { AdminOrderListRow } from './orders.repository';

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
    const status = row.status;
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

  /**
   * Listado de back office. Allow-list explícito a propósito: la fila de
   * `orders` trae `user_id` (identidad de otro tenant), `pickup_code` (secreto)
   * y los montos internos del negocio, y ninguno pertenece a una pantalla de
   * soporte. Si mañana se agrega una columna, no sale sola.
   */
  static toAdminListItem(
    row: AdminOrderListRow,
    now: Date = new Date(),
  ): AdminOrderListItemDto {
    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      business_id: row.business_id,
      business_name: row.business_name ?? null,
      offer_id: row.offer_id,
      offer_title: row.offer_title,
      price: toNumber(row.price),
      original_price: toNumber(row.original_price),
      pickup_start: row.pickup_start.toISOString(),
      pickup_end: row.pickup_end.toISOString(),
      is_stuck: isStuckOrder(row.status, row.pickup_end, now),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}

/**
 * Orden "atascada": su ventana de pickup ya cerró y sigue sin llegar a un
 * estado terminal. Comparte la lista de estados no terminales con el filtro
 * `stuck` del repositorio — una sola definición, para que la insignia de la
 * fila y el filtro no puedan discrepar.
 */
export function isStuckOrder(
  status: OrderStatus,
  pickupEnd: Date,
  now: Date = new Date(),
): boolean {
  return (
    pickupEnd.getTime() < now.getTime() &&
    (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status)
  );
}
