import { z } from "zod";
import { DateSchema, NonNegativeIntSchema } from "../../_common/schemas/common";

/**
 * Query del reporte de dinero del panel (`GET /stats/revenue`, solo admin).
 *
 * `from` y `to` son días calendario `YYYY-MM-DD` en UTC, ambos inclusivos. Son
 * opcionales: si falta alguno, la API resuelve el default (los últimos 30 días
 * hasta hoy) y devuelve la ventana efectiva en `period`, de modo que el cliente
 * nunca tiene que reconstruirla. Un período invertido se rechaza con 400.
 */
export const RevenueStatsQuerySchema = z.object({
	from: DateSchema.optional(),
	to: DateSchema.optional(),
});

/** Monto: número (no string) para que el panel pueda sumar y formatear. */
const MoneySchema = z.number().nonnegative();

/** Comisión efectiva del período: fracción (0.1 = 10%), igual que la tarifa. */
const CommissionRateSchema = z.number().min(0).max(1);

/** Período efectivo del reporte, ya resuelto por la API. */
const RevenuePeriodSchema = z.object({
	from: DateSchema,
	to: DateSchema,
});

/**
 * DEVENGADO: lo que la plataforma ganó por las órdenes `completed` CREADAS en el
 * período. El eje temporal es `orders.created_at`, el mismo eje con el que
 * `generate_payouts` arma `payouts.period_start`.
 *
 * OJO: se devenga, no se cobra. Que un negocio haya vendido en el período no
 * significa que ese dinero ya haya salido de la plataforma; para eso está
 * `collected`. Son dos números distintos y no se suman entre sí.
 */
const AccruedRevenueSchema = z.object({
	/** Volumen bruto vendido (GMV): `sum(orders.price)` de las completadas. */
	gross_amount: MoneySchema,
	/** Ingreso de la plataforma: `sum(orders.platform_fee)` de las completadas. */
	platform_fees: MoneySchema,
	/** Neto que corresponde a los negocios: `sum(orders.net_amount)`. */
	business_net: MoneySchema,
	/** `platform_fees / gross_amount`: comisión efectiva ponderada del período. */
	effective_commission_rate: CommissionRateSchema,
	/** Órdenes creadas en el período, por estado. */
	orders: z.object({
		total: NonNegativeIntSchema,
		completed: NonNegativeIntSchema,
		cancelled: NonNegativeIntSchema,
		expired: NonNegativeIntSchema,
	}),
});

/**
 * COBRADO: dinero que efectivamente salió de la plataforma. El eje temporal es
 * `payouts.paid_at` (cuándo se pagó), no la fecha de la orden: por eso
 * `collected` no tiene por qué igualar a `accrued` en la misma ventana, y esa
 * diferencia es información, no un error de cálculo.
 *
 * Lo pendiente y lo fallido se cuentan por `payouts.created_at` (el corte que
 * los originó), no por `paid_at`: un payout pendiente no tiene `paid_at`.
 */
const CollectedRevenueSchema = z.object({
	/** `sum(payouts.gross_amount)` de los payouts pagados en el período. */
	gross_amount: MoneySchema,
	/** `sum(payouts.platform_fee)`: comisión efectivamente cobrada. */
	platform_fees: MoneySchema,
	/** `sum(payouts.net_amount)`: dinero entregado a los negocios. */
	business_net: MoneySchema,
	/** Payouts marcados como pagados dentro del período. */
	paid_payouts: NonNegativeIntSchema,
	/** Neto aún no pagado: payouts `pending`/`processing` del período. */
	outstanding_business_net: MoneySchema,
	outstanding_payouts: NonNegativeIntSchema,
	/** Payouts `failed` del período, a revisar antes del siguiente corte. */
	failed_payouts: NonNegativeIntSchema,
});

/** Money report for a period. Admin-only: nunca se expone públicamente. */
export const RevenueStatsSchema = z.object({
	period: RevenuePeriodSchema,
	accrued: AccruedRevenueSchema,
	collected: CollectedRevenueSchema,
});
