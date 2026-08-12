import type { AppRole, OrderStatus } from '@0xc1x/role-commons';

/** Source of a status change event (stored in order_events.metadata). */
export type OrderEventSource = 'api' | 'cron' | 'admin';

/** Statuses that still hold reserved stock (must restock on cancel/expire). */
export const STOCK_HOLDING_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'ready_for_pickup',
] as const;

/** Active (non-terminal) order statuses — used for "one active order per offer/user". */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'ready_for_pickup',
  'picked_up',
] as const;

/** Allowed next statuses from a given status. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled', 'expired'],
  picked_up: ['completed'],
  completed: [],
  cancelled: [],
  expired: [],
};

/**
 * Who may perform a transition to the target status.
 *
 * Business-side actions require real ownership (`isBusinessOwner`), not merely
 * `actorRole === 'business'`. Admin always may transition within the graph.
 * System/cron paths bypass this via a dedicated service method.
 */
export function canActorTransition(
  actorRole: AppRole,
  from: OrderStatus,
  to: OrderStatus,
  opts: { isOrderOwner: boolean; isBusinessOwner: boolean },
): boolean {
  if (actorRole === 'admin') return true;

  if (to === 'cancelled') {
    // Consumer can cancel early; business owner can cancel operationally.
    if (opts.isOrderOwner && (from === 'pending' || from === 'confirmed')) {
      return true;
    }
    if (
      opts.isBusinessOwner &&
      (from === 'pending' ||
        from === 'confirmed' ||
        from === 'ready_for_pickup')
    ) {
      return true;
    }
    return false;
  }

  if (to === 'expired') {
    // Prefer system/cron; business owner may mark expired on pending/ready.
    return opts.isBusinessOwner;
  }

  // Forward progress is business-owner only (not any business role).
  if (
    (to === 'confirmed' ||
      to === 'ready_for_pickup' ||
      to === 'picked_up' ||
      to === 'completed') &&
    opts.isBusinessOwner
  ) {
    return true;
  }

  return false;
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Whether transitioning to `to` should restore reserved stock. */
export function shouldRestockOnTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return (
    (to === 'cancelled' || to === 'expired') &&
    (STOCK_HOLDING_STATUSES as readonly string[]).includes(from)
  );
}

/**
 * Whether the viewer may see `pickup_code`.
 * Consumer owner and admin always; business only from ready_for_pickup onward.
 */
export function canViewPickupCode(opts: {
  status: OrderStatus;
  isOrderOwner: boolean;
  isBusinessOwner: boolean;
  isAdmin: boolean;
}): boolean {
  if (opts.isAdmin || opts.isOrderOwner) return true;
  if (!opts.isBusinessOwner) return false;
  return (
    opts.status === 'ready_for_pickup' ||
    opts.status === 'picked_up' ||
    opts.status === 'completed'
  );
}
