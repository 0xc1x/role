import {
	OrderStatus,
	type Coupon,
	type Order,
	type OrderStatus as OrderStatusType,
} from "@0xc1x/role-commons";

export type { OrderStatusType };

export const orderStatusLabels: Record<OrderStatusType, string> = {
	pending: "Pendiente",
	confirmed: "Confirmado",
	ready_for_pickup: "Listo para recoger",
	picked_up: "Recogido",
	completed: "Completado",
	cancelled: "Cancelado",
	expired: "Expirado",
};

/** Orders in these states are considered terminal (no transitions out). */
const TERMINAL: ReadonlySet<OrderStatusType> = new Set([
	"completed",
	"cancelled",
	"expired",
]);

export function isTerminalStatus(status: OrderStatusType): boolean {
	return TERMINAL.has(status);
}

export function isActiveStatus(status: OrderStatusType): boolean {
	return !TERMINAL.has(status);
}

/** Legal status transitions per the order lifecycle in commons. */
export function canTransitionTo(
	from: OrderStatusType,
	to: OrderStatusType,
): boolean {
	switch (from) {
		case "pending":
			return to === "confirmed" || to === "cancelled" || to === "expired";
		case "confirmed":
			return (
				to === "ready_for_pickup" || to === "cancelled" || to === "expired"
			);
		case "ready_for_pickup":
			return (
				to === "picked_up" ||
				to === "completed" ||
				to === "cancelled" ||
				to === "expired"
			);
		case "picked_up":
			return to === "completed";
		default:
			return false; // completed / cancelled / expired are terminal
	}
}

export { OrderStatus };

/** Order composed with its embedded offer/business/customer relations. */
export interface OrderDetail {
	order: Order;
	offerTitle: string;
	offerImageUrl: string | null;
	businessName: string;
	businessAddress: string | null;
	businessPhone: string | null;
	businessLocationId: string | null;
	customerName: string | null;
	customerPhone: string | null;
	customerEmail: string | null;
}

export function orderDiscount(
	order: Pick<Order, "original_price" | "price">,
): number {
	return order.original_price - order.price;
}

export function orderDiscountPercentage(
	order: Pick<Order, "original_price" | "price">,
): number {
	if (order.original_price <= 0) return 0;
	return ((order.original_price - order.price) / order.original_price) * 100;
}

// ─── Coupon helpers (commons Coupon + pure logic) ─────────────────────

export function couponIsExpired(
	coupon: Pick<Coupon, "expires_at">,
	now: Date = new Date(),
): boolean {
	return coupon.expires_at != null && new Date(coupon.expires_at) < now;
}

export function couponIsExhausted(
	coupon: Pick<Coupon, "max_uses" | "used_count">,
): boolean {
	return coupon.max_uses != null && coupon.used_count >= coupon.max_uses;
}

export function couponIsValid(coupon: Coupon, now: Date = new Date()): boolean {
	return (
		coupon.is_active &&
		!couponIsExpired(coupon, now) &&
		!couponIsExhausted(coupon)
	);
}

export function couponDiscount(coupon: Coupon, price: number): number {
	if (coupon.type === "percentage") {
		return Math.min((price * coupon.value) / 100, price);
	}
	return Math.min(coupon.value, price);
}

// ─── Reservation / cancellation results (from reserve_offer RPC) ──────

export interface ReservationSuccess {
	ok: true;
	orderId: string;
	orderNumber: string;
	pickupCode: string;
	price: number;
	originalPrice: number;
	discount: number;
}

export interface ReservationFailure {
	ok: false;
	errorCode: string;
	message: string;
}

export type ReservationResult = ReservationSuccess | ReservationFailure;

export interface CancelOrderResult {
	success: boolean;
	orderId?: string;
	errorCode?: string;
	message?: string;
}
