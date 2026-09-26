import { z } from "zod";
import {
	OrderStatusSchema,
	PositiveNumberSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

export const OrderSchema = z.object({
	id: UuidSchema,
	user_id: UuidSchema,
	offer_id: UuidSchema,
	business_id: UuidSchema,
	order_number: z.string().min(1),
	idempotency_key: z.string().min(1).max(128).nullable().optional(),
	status: OrderStatusSchema,
	price: PositiveNumberSchema,
	original_price: PositiveNumberSchema,
	pickup_code: z.string().min(1),
	pickup_time: TimestamptzSchema.nullable(),
	coupon_id: UuidSchema.nullable(),
	/** Tarifa congelada al crear la orden (fracción, ej. 0.1 = 10%). */
	commission_rate: z.number().min(0).max(1),
	platform_fee: z.number().min(0),
	net_amount: z.number().min(0),
	payout_id: UuidSchema.nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

export const CreateOrderSchema = z.object({
	user_id: UuidSchema,
	offer_id: UuidSchema,
	business_id: UuidSchema,
	order_number: z.string().min(1),
	idempotency_key: z.string().min(1).max(128).nullable().optional(),
	status: OrderStatusSchema.optional(),
	price: PositiveNumberSchema,
	original_price: PositiveNumberSchema,
	pickup_code: z.string().min(1),
	pickup_time: TimestamptzSchema.nullable().optional(),
	coupon_id: UuidSchema.nullable().optional(),
	commission_rate: z.number().min(0).max(1).optional(),
	platform_fee: z.number().min(0).optional(),
	net_amount: z.number().min(0).optional(),
	payout_id: UuidSchema.nullable().optional(),
});

export const UpdateOrderSchema = z
	.object({
		status: OrderStatusSchema,
		pickup_time: TimestamptzSchema.nullable(),
		coupon_id: UuidSchema.nullable(),
		price: PositiveNumberSchema,
	})
	.partial();

/**
 * Fila del listado de back office (`GET /orders/admin`).
 *
 * Deliberadamente NO incluye `user_id`, `pickup_code` ni `idempotency_key`:
 * el panel no necesita el id del consumidor (identidad de otro tenant) ni el
 * código de recogida (secreto) ni la clave de idempotencia. Tampoco incluye
 * `commission_rate`/`platform_fee`/`net_amount`/`payout_id`: el dinero del
 * negocio lo cuenta la superficie de pagos, no el listado de órdenes.
 *
 * `pickup_start`/`pickup_end` son los de la OFERTA, no `pickup_time` de la
 * orden: `pickup_time` es nullable y casi siempre lo está, así que la ventana
 * real de recogida solo se puede leer haciendo join a `offers`.
 */
export const AdminOrderListItemSchema = z.object({
	id: UuidSchema,
	order_number: z.string().min(1),
	status: OrderStatusSchema,
	business_id: UuidSchema,
	/** `leftJoin` a `businesses`: el nombre se resuelve en la misma query. */
	business_name: z.string().nullable(),
	offer_id: UuidSchema,
	offer_title: z.string(),
	price: PositiveNumberSchema,
	original_price: PositiveNumberSchema,
	pickup_start: TimestamptzSchema,
	pickup_end: TimestamptzSchema,
	/**
	 * Ventana de pickup cerrada con la orden todavía en un estado no terminal.
	 * Viene del servidor (no lo recalcula el panel) para que el filtro `stuck`
	 * y la insignia de la fila no puedan discrepar entre sí.
	 */
	is_stuck: z.boolean(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});
