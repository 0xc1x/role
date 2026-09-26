import type { OrderStatus } from "./order-status";

/** Statuses that still hold reserved stock (must restock on cancel/expire). */
export const STOCK_HOLDING_STATUSES: readonly OrderStatus[] = [
	"pending",
	"confirmed",
	"ready_for_pickup",
] as const;

/** Allowed next statuses from a given status. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
	pending: ["confirmed", "cancelled", "expired"],
	confirmed: ["ready_for_pickup", "cancelled"],
	ready_for_pickup: ["picked_up", "cancelled", "expired"],
	picked_up: ["completed"],
	completed: [],
	cancelled: [],
	expired: [],
};

export function isTransitionAllowed(
	from: OrderStatus,
	to: OrderStatus,
): boolean {
	return (ORDER_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Whether transitioning to `to` should restore reserved stock. */
export function shouldRestockOnTransition(
	from: OrderStatus,
	to: OrderStatus,
): boolean {
	return (
		(to === "cancelled" || to === "expired") &&
		(STOCK_HOLDING_STATUSES as readonly string[]).includes(from)
	);
}

/**
 * Whether entering `to` credits the order's net amount to the business balance.
 *
 * The edge into `completed` is the only one that moves money, so the rule is a
 * property of the graph and not of whoever performs the transition.
 */
export function shouldAccrueEarningsOnTransition(to: OrderStatus): boolean {
	return to === "completed";
}
