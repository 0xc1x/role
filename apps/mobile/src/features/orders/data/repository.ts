import type {
	Coupon,
	Order,
	OrderStatus as OrderStatusType,
} from "@0xc1x/role-commons";

import { supabase } from "@/src/core/supabase/client";
import { toAppError } from "@/src/core/error/mapper";
import { Errors } from "@/src/core/error/app-error";

import type {
	CancelOrderResult,
	MyReviewView,
	OrderDetail,
	OrderStatusEvent,
	ReservationFailure,
	ReservationResult,
} from "../domain/order";

// `order_events` va sin `!inner`: si RLS no expone eventos para el rol,
// PostgREST devuelve la colección vacía en lugar de fallar toda la query.
const ORDER_SELECT = `
  id, user_id, offer_id, business_id, order_number, status,
  price, original_price, pickup_code, pickup_time, coupon_id, created_at,
  order_events (status, created_at),
  offers!inner (
    title, image, business_location_id,
    business_locations:business_location_id (address)
  ),
  businesses!inner (name, phone, image, cover_image),
  profiles!orders_user_id_fkey (full_name, phone, email)
`;

type Row = Record<string, unknown>;

// Head-count select: mirrors the list embeds so join-dependent filters
// (`offers.*`, `businesses.*`, `profiles.*` in `or()` / `eq()`) resolve
// server-side instead of 400ing against a bare `"id"` select. `!inner`
// matches the list semantics; `profiles` stays a left join like the list.
const ORDER_COUNT_SELECT = `
  id,
  offers!inner (title, business_location_id),
  businesses!inner (name),
  profiles!orders_user_id_fkey (full_name)
`;

/**
 * Server-side list params for the orders catalogs. Every field maps to a
 * PostgREST filter so listing scales without fetching all rows; `limit` /
 * `offset` map to `.range()`.
 */
export interface OrderListParams {
	status?: OrderStatusType;
	statuses?: readonly OrderStatusType[];
	from?: string;
	to?: string;
	search?: string;
	/** Business orders only: `offers.business_location_id` (via `!inner`). */
	branchId?: string | null;
	limit?: number;
	offset?: number;
	/** Newest first by default (matches previous client behavior). */
	ascending?: boolean;
}

/** Minimal chainable shape of the PostgREST query builder (untyped client). */
interface OrderQuery {
	eq(column: string, value: unknown): OrderQuery;
	in(column: string, values: readonly unknown[]): OrderQuery;
	gte(column: string, value: unknown): OrderQuery;
	lte(column: string, value: unknown): OrderQuery;
	or(filters: string): OrderQuery;
	order(column: string, options?: { ascending?: boolean }): OrderQuery;
	range(from: number, to: number): OrderQuery;
}

// biome-ignore lint: dynamic builder passthrough — generics over the untyped
// Supabase client blow up tsc (TS2589); the interface above documents the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrderListFilters(query: any, params: OrderListParams): any {
	let q: OrderQuery = query;
	if (params.status != null) q = q.eq("status", params.status);
	if (params.statuses != null && params.statuses.length > 0)
		q = q.in("status", [...params.statuses]);
	if (params.from != null) q = q.gte("created_at", params.from);
	if (params.to != null) q = q.lte("created_at", params.to);
	if (params.branchId != null)
		q = q.eq("offers.business_location_id", params.branchId);
	const search = params.search?.trim();
	if (search) q = q.or(orderSearchOr(search));
	return q;
}

/**
 * Multi-field search as a single server-side `or` over the order number and
 * the `!inner` embeds (offer title, business name, customer name). PostgREST
 * resolves the dotted refs through the embedded joins.
 */
function orderSearchOr(search: string): string {
	const pattern = quoteOrValue(
		`%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`,
	);
	return [
		`order_number.ilike.${pattern}`,
		`offers.title.ilike.${pattern}`,
		`businesses.name.ilike.${pattern}`,
		`profiles.full_name.ilike.${pattern}`,
	].join(",");
}

/** Quote an `or` value when it contains PostgREST reserved chars. */
function quoteOrValue(value: string): string {
	return /[,()"\\]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrderPaging(query: any, params: OrderListParams): any {
	let q: OrderQuery = query.order("created_at", {
		ascending: params.ascending ?? false,
	});
	if (params.limit != null) {
		const offset = params.offset ?? 0;
		q = q.range(offset, offset + params.limit - 1);
	}
	return q;
}

export function createReservationIdempotencyKey(): string {
	const webCrypto = globalThis.crypto as { randomUUID?: () => string };
	if (webCrypto.randomUUID) return webCrypto.randomUUID();
	return `reservation-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const orderRepository = {
	/**
	 * Reserves an offer through the `reserve_offer` RPC — the transaction
	 * boundary that checks stock and creates the order server-side
	 * (business rules live in the DB, not the client).
	 */
	async reserveOffer(
		offerId: string,
		couponId: string | undefined,
		idempotencyKey: string,
	): Promise<ReservationResult> {
		const userId = await currentUserId();
		if (!userId) {
			return {
				ok: false,
				errorCode: "NOT_AUTHENTICATED",
				message: "Debes iniciar sesión para reservar",
			};
		}
		try {
			const { data, error } = await supabase.rpc("reserve_offer", {
				p_user_id: userId,
				p_offer_id: offerId,
				p_coupon_id: couponId ?? null,
				p_idempotency_key: idempotencyKey,
			});
			if (error) throw toAppError(error, "Error al procesar la reserva");
			const result = (data ?? {}) as { success?: boolean } & Record<
				string,
				unknown
			>;
			if (result.success === true) {
				return {
					ok: true,
					orderId: String(result.order_id),
					orderNumber: String(result.order_number ?? ""),
					pickupCode: String(result.pickup_code ?? ""),
					price: num(result.price) ?? 0,
					originalPrice: num(result.original_price) ?? 0,
					discount: num(result.discount) ?? 0,
				};
			}
			const rawErrorCode = result.error;
			return {
				ok: false,
				errorCode:
					typeof rawErrorCode === "string"
						? (rawErrorCode as ReservationFailure["errorCode"])
						: "UNKNOWN",
				message: String(result.message ?? "Error al reservar"),
			};
		} catch (e) {
			throw toAppError(e, "Error al procesar la reserva");
		}
	},

	async getUserOrders(
		userId: string,
		params: OrderListParams = {},
	): Promise<OrderDetail[]> {
		let query = supabase
			.from("orders")
			.select(ORDER_SELECT)
			.eq("user_id", userId);
		query = applyOrderListFilters(query, params);
		query = applyOrderPaging(query, params);
		const { data, error } = await query;
		if (error) throw toAppError(error, "Error al cargar pedidos");
		return toRows(data).map(mapOrderDetail);
	},

	/** Server-side head count with the same filters (no rows fetched). */
	async countUserOrders(
		userId: string,
		params: OrderListParams = {},
	): Promise<number> {
		let query = supabase
			.from("orders")
			.select(ORDER_COUNT_SELECT, { count: "exact", head: true })
			.eq("user_id", userId);
		query = applyOrderListFilters(query, params);
		const { count, error } = (await query) as unknown as {
			count: number | null;
			error: unknown;
		};
		if (error) throw toAppError(error, "Error al contar pedidos");
		return count ?? 0;
	},

	async getOrderById(id: string): Promise<OrderDetail> {
		const { data, error } = await supabase
			.from("orders")
			.select(ORDER_SELECT)
			.eq("id", id)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar el pedido");
		if (!data) throw Errors.notFound("Pedido no encontrado");
		return mapOrderDetail(data as unknown as Row);
	},

	async getBusinessOrders(
		businessId: string,
		params: OrderListParams = {},
	): Promise<OrderDetail[]> {
		let query = supabase
			.from("orders")
			.select(ORDER_SELECT)
			.eq("business_id", businessId);
		query = applyOrderListFilters(query, params);
		query = applyOrderPaging(query, params);
		const { data, error } = await query;
		if (error) throw toAppError(error, "Error al cargar los pedidos");
		return toRows(data).map(mapOrderDetail);
	},

	/** Server-side head count with the same filters (no rows fetched). */
	async countBusinessOrders(
		businessId: string,
		params: OrderListParams = {},
	): Promise<number> {
		let query = supabase
			.from("orders")
			.select(ORDER_COUNT_SELECT, { count: "exact", head: true })
			.eq("business_id", businessId);
		query = applyOrderListFilters(query, params);
		const { count, error } = (await query) as unknown as {
			count: number | null;
			error: unknown;
		};
		if (error) throw toAppError(error, "Error al contar los pedidos");
		return count ?? 0;
	},

	async updateOrderStatus(
		orderId: string,
		status: OrderStatusType,
	): Promise<void> {
		// RPC `set_order_status`: ownership + matriz de transiciones + restock
		// en cancelación viven server-side (el UPDATE directo chocaba con el
		// with_check de RLS para pending→cancelled).
		const { data, error } = await supabase.rpc("set_order_status", {
			p_order_id: orderId,
			p_status: status,
		});
		if (error)
			throw toAppError(error, "Error al actualizar el estado del pedido");
		const result = (data ?? {}) as Record<string, unknown>;
		if (result.success !== true) {
			throw Errors.businessRule(
				typeof result.message === "string"
					? result.message
					: "No se pudo actualizar el estado del pedido",
				typeof result.error === "string" ? result.error : undefined,
			);
		}
	},

	/**
	 * Cancels an order as the business via the `cancel_order` RPC
	 * (`p_business_id`): ownership, rules and stock restock are server-side.
	 */
	async cancelOrderForBusiness(
		orderId: string,
		businessId: string,
	): Promise<CancelOrderResult> {
		try {
			const { data, error } = await supabase.rpc("cancel_order", {
				p_order_id: orderId,
				p_business_id: businessId,
			});
			if (error) throw toAppError(error, "Error al cancelar el pedido");
			const result = (data ?? {}) as Record<string, unknown>;
			if (result.success === true) {
				return {
					success: true,
					orderId: result.order_id ? String(result.order_id) : undefined,
				};
			}
			return {
				success: false,
				errorCode: String(result.error ?? "UNKNOWN"),
				message: String(result.message ?? "Error al cancelar"),
			};
		} catch (e) {
			throw toAppError(e, "Error al cancelar el pedido");
		}
	},

	/** Cancels an order via the `cancel_order` RPC (server-side rules). */
	async cancelOrder(orderId: string): Promise<CancelOrderResult> {
		const userId = await currentUserId();
		if (!userId) {
			return {
				success: false,
				errorCode: "NOT_AUTHENTICATED",
				message: "Debes iniciar sesión para cancelar",
			};
		}
		try {
			const { data, error } = await supabase.rpc("cancel_order", {
				p_user_id: userId,
				p_order_id: orderId,
			});
			if (error) throw toAppError(error, "Error al cancelar el pedido");
			const result = (data ?? {}) as Record<string, unknown>;
			if (result.success === true) {
				return {
					success: true,
					orderId: result.order_id ? String(result.order_id) : undefined,
				};
			}
			return {
				success: false,
				errorCode: String(result.error ?? "UNKNOWN"),
				message: String(result.message ?? "Error al cancelar"),
			};
		} catch (e) {
			throw toAppError(e, "Error al cancelar el pedido");
		}
	},

	/** Validates a pickup code via the `validate_pickup_code` RPC. */
	async validatePickupCode(
		orderId: string,
		pickupCode: string,
	): Promise<{
		success: boolean;
		orderId?: string;
		errorCode?: string;
		message?: string;
	}> {
		try {
			const { data, error } = await supabase.rpc("validate_pickup_code", {
				p_order_id: orderId,
				p_pickup_code: pickupCode,
			});
			if (error)
				throw toAppError(error, "Error al validar el código de recogida");
			const result = (data ?? {}) as Record<string, unknown>;
			if (result.success === true) {
				return {
					success: true,
					orderId: result.order_id ? String(result.order_id) : undefined,
				};
			}
			return {
				success: false,
				errorCode: result.error ? String(result.error) : undefined,
				message: result.message ? String(result.message) : undefined,
			};
		} catch (e) {
			throw toAppError(e, "Error al validar el código de recogida");
		}
	},

	async getCouponByCode(
		code: string,
		businessId: string,
	): Promise<Coupon | null> {
		const upperCode = code.toUpperCase();
		// Precedencia: cupón del negocio primero, global (business_id null)
		// después — espejo del match de `reserve_offer`.
		const { data: businessCoupon, error: businessError } = await supabase
			.from("coupons")
			.select("*")
			.eq("code", upperCode)
			.eq("business_id", businessId)
			.eq("is_active", true)
			.maybeSingle();
		if (businessError)
			throw toAppError(businessError, "Error al validar el cupón");
		if (businessCoupon) return businessCoupon as unknown as Coupon;

		const { data: globalCoupon, error: globalError } = await supabase
			.from("coupons")
			.select("*")
			.eq("code", upperCode)
			.is("business_id", null)
			.eq("is_active", true)
			.maybeSingle();
		if (globalError) throw toAppError(globalError, "Error al validar el cupón");
		return (globalCoupon as unknown as Coupon | null) ?? null;
	},

	async submitReview(input: {
		orderId: string;
		businessId: string;
		productRating: number;
		businessRating: number;
		comment?: string | null;
	}): Promise<void> {
		const userId = await currentUserId();
		if (!userId)
			throw Errors.unauthorized(
				"Debes iniciar sesión para publicar una reseña",
			);
		const sanitized =
			input.comment != null && input.comment.trim().length > 0
				? input.comment.trim()
				: null;
		const { error } = await supabase.from("reviews").upsert(
			{
				user_id: userId,
				order_id: input.orderId,
				business_id: input.businessId,
				product_rating: input.productRating,
				business_rating: input.businessRating,
				comment: sanitized,
			},
			{ onConflict: "user_id,order_id" },
		);
		if (error) throw toAppError(error, "Error al publicar la reseña");
	},

	/** Reseñas del usuario actual con contexto de negocio/oferta (Mis reseñas). */
	async getMyReviews(
		params: { limit?: number; offset?: number } = {},
	): Promise<MyReviewView[]> {
		const userId = await currentUserId();
		if (!userId)
			throw Errors.unauthorized("Debes iniciar sesión para ver tus reseñas");
		let paged = supabase
			.from("reviews")
			.select(
				`id, order_id, business_id, product_rating, business_rating, comment, created_at,
        businesses!inner (name),
        orders!reviews_order_id_fkey (offers (title))`,
			)
			.eq("user_id", userId)
			.order("created_at", { ascending: false });
		if (params.limit != null) {
			const offset = params.offset ?? 0;
			paged = paged.range(offset, offset + params.limit - 1);
		}
		const { data, error } = await paged;
		if (error) throw toAppError(error, "Error al cargar tus reseñas");
		return toRows(data).map(mapMyReview);
	},

	/** Reseña de un pedido (detalle negocio read-only / precarga del editor). */
	async getReviewByOrderId(orderId: string): Promise<MyReviewView | null> {
		const { data, error } = await supabase
			.from("reviews")
			.select(
				`id, order_id, business_id, product_rating, business_rating, comment, created_at,
        businesses!inner (name),
        orders!reviews_order_id_fkey (offers (title))`,
			)
			.eq("order_id", orderId)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar la reseña");
		if (!data) return null;
		return mapMyReview(data as unknown as Row);
	},

	async deleteReview(reviewId: string): Promise<void> {
		const { error } = await supabase
			.from("reviews")
			.delete()
			.eq("id", reviewId);
		if (error) throw toAppError(error, "Error al eliminar la reseña");
	},
};

function mapOrderDetail(row: Row): OrderDetail {
	const offer = (row.offers ?? {}) as Row;
	const business = (row.businesses ?? {}) as Row;
	const customer = (row.profiles ?? null) as Row | null;
	const location = (offer.business_locations ?? null) as Row | null;
	const customerEmail =
		customer != null && typeof customer.email === "string"
			? customer.email
			: null;

	const order: Order = {
		id: String(row.id),
		user_id: String(row.user_id),
		offer_id: String(row.offer_id),
		business_id: String(row.business_id),
		order_number: String(row.order_number ?? ""),
		status: (row.status as OrderStatusType | null) ?? "pending",
		price: num(row.price) ?? 0,
		original_price: num(row.original_price) ?? 0,
		pickup_code: String(row.pickup_code ?? ""),
		pickup_time: (row.pickup_time as string | null) ?? null,
		coupon_id: (row.coupon_id as string | null) ?? null,
		commission_rate: num(row.commission_rate) ?? 0,
		platform_fee: num(row.platform_fee) ?? 0,
		net_amount: num(row.net_amount) ?? 0,
		payout_id: (row.payout_id as string | null) ?? null,
		created_at: String(row.created_at ?? ""),
		updated_at: String(row.updated_at ?? ""),
	};

	return {
		order,
		offerTitle: String(offer.title ?? "Oferta"),
		offerImageUrl: (offer.image as string | null) ?? null,
		businessName: String(business.name ?? "Negocio"),
		businessImageUrl:
			(business.image as string | null) ??
			(business.cover_image as string | null) ??
			null,
		businessAddress: (location?.address as string | null) ?? null,
		businessPhone: (business.phone as string | null) ?? null,
		businessLocationId: (offer.business_location_id as string | null) ?? null,
		customerName: (customer?.full_name as string | null) ?? null,
		customerPhone: (customer?.phone as string | null) ?? null,
		customerEmail: customerEmail,
		events: mapStatusEvents(row.order_events),
	};
}

function mapMyReview(row: Row): MyReviewView {
	const business = (row.businesses ?? {}) as Row;
	const order = (row.orders ?? {}) as Row;
	const offer = (order.offers ?? {}) as Row;
	return {
		id: String(row.id),
		orderId: String(row.order_id ?? ""),
		businessId: String(row.business_id ?? ""),
		businessName: String(business.name ?? "Negocio"),
		offerTitle: String(offer.title ?? "Oferta"),
		productRating: num(row.product_rating) ?? 0,
		businessRating: num(row.business_rating) ?? 0,
		comment: (row.comment as string | null) ?? null,
		date: String(row.created_at ?? ""),
	};
}

function mapStatusEvents(value: unknown): OrderStatusEvent[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(e): e is { status: OrderStatusType; created_at: string } =>
				e != null &&
				typeof (e as Row).status === "string" &&
				typeof (e as Row).created_at === "string",
		)
		.map((e) => ({
			status: e.status as OrderStatusType,
			created_at: e.created_at,
		}))
		.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function toRows(data: unknown): Row[] {
	return Array.isArray(data) ? (data as Row[]) : [];
}

async function currentUserId(): Promise<string | null> {
	const { data } = await supabase.auth.getUser();
	return data.user?.id ?? null;
}

function num(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}
