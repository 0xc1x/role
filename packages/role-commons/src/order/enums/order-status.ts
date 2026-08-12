export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'ready_for_pickup',
  'picked_up',
  'completed',
  'cancelled',
  'expired',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const OrderStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const satisfies Record<string, OrderStatus>;
