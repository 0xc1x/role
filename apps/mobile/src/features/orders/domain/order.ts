import {
	OrderStatus,
	type Coupon,
	type Order,
	type OrderStatus as OrderStatusType,
	type ReserveOfferErrorCode,
} from "@0xc1x/role-commons";
import type { BadgeTone } from "@/src/core/ui";

export type { OrderStatusType };

/** Valor escaneable del QR de recogida (contrato con el escáner del negocio). */
export function pickupQrValue(orderId: string, pickupCode: string): string {
	return `role://order/${orderId}/${pickupCode}`;
}

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

/** Server-side tab filters (mirror of TERMINAL above). */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatusType[] = [
	"pending",
	"confirmed",
	"ready_for_pickup",
	"picked_up",
];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatusType[] = [
	"completed",
	"cancelled",
	"expired",
];

/** Presentational mapping of order status → badge tone (pure, shared consumer/business). */
export function orderStatusTone(status: OrderStatusType): BadgeTone {
	switch (status) {
		case "pending":
			return "warning";
		case "confirmed":
			return "info";
		case "ready_for_pickup":
			return "brand";
		case "picked_up":
			return "info";
		case "completed":
			return "success";
		case "cancelled":
			return "neutral";
		case "expired":
			return "danger";
	}
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
	businessImageUrl: string | null;
	businessAddress: string | null;
	businessPhone: string | null;
	businessLocationId: string | null;
	customerName: string | null;
	customerPhone: string | null;
	customerEmail: string | null;
	/** Cambios de estado registrados en `order_events` (vacío si RLS no expone ninguno). */
	events: OrderStatusEvent[];
}

/** Proyección mínima de `public.order_events` para el historial del pedido. */
export interface OrderStatusEvent {
	status: OrderStatusType;
	created_at: string;
}

/** Reseña propia del usuario con contexto del pedido/negocio (pantalla Mis reseñas). */
export interface MyReviewView {
	id: string;
	orderId: string;
	businessId: string;
	businessName: string;
	offerTitle: string;
	productRating: number;
	businessRating: number;
	comment: string | null;
	date: string;
}

/**
 * Timestamp real (ISO de `order_events`) del último cambio de estado entre
 * los estados dados, o null si no hay eventos (RLS u órdenes previas al
 * logging). La presentación decide: "—" u omitir la sección; nunca
 * fabricar tiempos con created_at/pickup_time.
 */
export function findLastEventTime(
	events: readonly OrderStatusEvent[],
	statuses: readonly OrderStatusType[],
): string | null {
	const wanted = new Set(statuses);
	let last: string | null = null;
	for (const event of events) {
		if (!wanted.has(event.status)) continue;
		if (last == null || event.created_at > last) last = event.created_at;
	}
	return last;
}

/**
 * Timestamp real (ISO de `order_events`) del último cambio de estado entre
 * los estados dados; si no hay eventos, cae al fallback (heurística previa).
 * El formateo para pantalla queda en la capa de presentación.
 */
export function lastEventTimeFor(
	events: readonly OrderStatusEvent[],
	statuses: readonly OrderStatusType[],
	fallback: string,
): string {
	return findLastEventTime(events, statuses) ?? fallback;
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
	const raw =
		coupon.type === "percentage"
			? Math.min((price * coupon.value) / 100, price)
			: Math.min(coupon.value, price);
	// Redondeo a centavos: evita 0.1+0.2 en el checkout.
	return Math.round(raw * 100) / 100;
}

const toCents = (value: number): number => Math.round(value * 100);

/** Totales del checkout calculados una sola vez en centavos enteros. */
export interface CheckoutTotals {
	/** Descuento de la oferta (original − discounted), en moneda. */
	offerDiscount: number;
	/** Descuento del cupón aplicado, en moneda (0 sin cupón). */
	coupon: number;
	/** Total a pagar, en moneda (nunca negativo). */
	total: number;
}

export function checkoutTotals(
	offer:
		| Pick<Order, "original_price" | "price">
		| { original_price: number; discounted_price: number },
	coupon: Coupon | null,
): CheckoutTotals {
	const price =
		"discounted_price" in offer ? offer.discounted_price : offer.price;
	const priceCents = toCents(price);
	const couponCents = coupon ? toCents(couponDiscount(coupon, price)) : 0;
	return {
		offerDiscount: (toCents(offer.original_price) - priceCents) / 100,
		coupon: couponCents / 100,
		total: Math.max(priceCents - couponCents, 0) / 100,
	};
}

/** Mínimo del cupón comparado en centavos (mismas unidades, sin float). */
export function meetsCouponMinimum(
	price: number,
	minOrderAmount: number | null,
): boolean {
	if (minOrderAmount == null) return true;
	return toCents(price) >= toCents(minOrderAmount);
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
	/** Códigos del contrato `reserve_offer` en commons + guardas locales del repo. */
	errorCode: ReserveOfferErrorCode | "NOT_AUTHENTICATED" | "UNKNOWN";
	message: string;
}

export type ReservationResult = ReservationSuccess | ReservationFailure;

export interface CancelOrderResult {
	success: boolean;
	orderId?: string;
	errorCode?: string;
	message?: string;
}

// ─── History date filter (shared consumer/business) ───────────────────

export type HistoryPeriod = "today" | "week" | "all";

/** Lunes 00:00 → domingo 23:59 UTC de la semana con offset (0 = actual). */
export function getWeekRange(
	now: Date,
	weekOffset: number,
): { monday: Date; sunday: Date } {
	const base = new Date(now);
	base.setUTCDate(base.getUTCDate() + weekOffset * 7);
	const day = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
	const monday = new Date(base);
	monday.setUTCDate(base.getUTCDate() - day + 1);
	monday.setUTCHours(0, 0, 0, 0);
	const sunday = new Date(monday);
	sunday.setUTCDate(monday.getUTCDate() + 6);
	sunday.setUTCHours(23, 59, 59, 999);
	return { monday, sunday };
}

export function formatDayMonth(d: Date): string {
	return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Filtra items con `order.created_at` según período del historial. */
export function filterByHistoryPeriod<
	T extends { order: Pick<Order, "created_at"> },
>(
	items: readonly T[],
	period: HistoryPeriod,
	weekOffset: number,
	now: Date = new Date(),
): T[] {
	if (period === "all") return [...items];
	if (period === "today") {
		const start = new Date(now);
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date(now);
		end.setUTCHours(23, 59, 59, 999);
		return items.filter((i) => {
			const d = new Date(i.order.created_at);
			return d >= start && d <= end;
		});
	}
	const { monday, sunday } = getWeekRange(now, weekOffset);
	return items.filter((i) => {
		const d = new Date(i.order.created_at);
		return d >= monday && d <= sunday;
	});
}
