import type { AppRole, OrderStatus } from '@0xc1x/role-commons';

/**
 * El grafo de transiciones y su efecto sobre el stock viven en el contrato
 * compartido: el panel de back office deriva de ahí las mismas opciones legales
 * que la API exige, para que no puedan discrepar. Se reexportan aquí porque este
 * módulo sigue siendo la puerta del dominio de órdenes.
 */
export {
  isTransitionAllowed,
  ORDER_TRANSITIONS,
  shouldRestockOnTransition,
  STOCK_HOLDING_STATUSES,
} from '@0xc1x/role-commons';

/** Active (non-terminal) order statuses — used for "one active order per offer/user". */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'ready_for_pickup',
  'picked_up',
] as const;

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
