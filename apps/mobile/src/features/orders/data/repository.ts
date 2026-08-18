import type {
	Coupon,
	Order,
	OrderStatus as OrderStatusType,
} from "@0xc1x/role-commons";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";
import { Errors } from "@/core/error/app-error";

import type {
	CancelOrderResult,
	OrderDetail,
	ReservationResult,
} from "../domain/order";

const ORDER_SELECT = `
  id, user_id, offer_id, business_id, order_number, status,
  price, original_price, pickup_code, pickup_time, coupon_id, created_at,
  offers!inner (
    title, image, business_location_id,
    business_locations:business_location_id (address)
  ),
  businesses!inner (name, phone),
  profiles!orders_user_id_fkey (full_name, phone, email)
`;

type Row = Record<string, unknown>;

export const orderRepository = {
	/**
	 * Reserves an offer through the `reserve_offer` RPC — the transaction
	 * boundary that checks stock and creates the order server-side
	 * (business rules live in the DB, not the client).
	 */
	async reserveOffer(
		offerId: string,
		couponId?: string,
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
			return {
				ok: false,
				errorCode: String(result.error ?? "UNKNOWN"),
				message: String(result.message ?? "Error al reservar"),
			};
		} catch (e) {
			throw toAppError(e, "Error al procesar la reserva");
		}
	},

	async getUserOrders(userId: string): Promise<OrderDetail[]> {
		const { data, error } = await supabase
			.from("orders")
			.select(ORDER_SELECT)
			.eq("user_id", userId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar pedidos");
		return toRows(data).map(mapOrderDetail);
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

	async getBusinessOrders(businessId: string): Promise<OrderDetail[]> {
		const { data, error } = await supabase
			.from("orders")
			.select(ORDER_SELECT)
			.eq("business_id", businessId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar los pedidos");
		return toRows(data).map(mapOrderDetail);
	},

	async updateOrderStatus(
		orderId: string,
		status: OrderStatusType,
	): Promise<void> {
		const { error } = await supabase
			.from("orders")
			.update({ status })
			.eq("id", orderId);
		if (error)
			throw toAppError(error, "Error al actualizar el estado del pedido");
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
		const { data, error } = await supabase
			.from("coupons")
			.select("*")
			.eq("code", code.toUpperCase())
			.eq("business_id", businessId)
			.eq("is_active", true)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al validar el cupón");
		return (data as unknown as Coupon | null) ?? null;
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
		created_at: String(row.created_at ?? ""),
		updated_at: String(row.updated_at ?? ""),
	};

	return {
		order,
		offerTitle: String(offer.title ?? "Oferta"),
		offerImageUrl: (offer.image as string | null) ?? null,
		businessName: String(business.name ?? "Negocio"),
		businessAddress: (location?.address as string | null) ?? null,
		businessPhone: (business.phone as string | null) ?? null,
		businessLocationId: (offer.business_location_id as string | null) ?? null,
		customerName: (customer?.full_name as string | null) ?? null,
		customerPhone: (customer?.phone as string | null) ?? null,
		customerEmail: customerEmail,
	};
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
