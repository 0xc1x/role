import { describe, expect, it } from "bun:test";
import { RevenueStatsSchema } from "../schemas/revenue-stats.schema";

/** Payload mínimo válido: accrued y collected con montos distintos a propósito. */
const payload = {
	period: { from: "2026-09-01", to: "2026-09-30" },
	accrued: {
		gross_amount: 1500,
		platform_fees: 150,
		business_net: 1350,
		effective_commission_rate: 0.1,
		orders: { total: 20, completed: 15, cancelled: 3, expired: 2 },
	},
	collected: {
		gross_amount: 900,
		platform_fees: 90,
		business_net: 810,
		paid_payouts: 3,
		outstanding_business_net: 450,
		outstanding_payouts: 2,
		failed_payouts: 0,
	},
};

describe("RevenueStatsSchema", () => {
	it("acepta el payload completo", () => {
		const result = RevenueStatsSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("mantiene devengado y cobrado en objetos separados", () => {
		const result = RevenueStatsSchema.parse(payload);
		// Mismos nombres de campo a propósito, valores distintos: si alguien
		// confunde las dos caras, el schema no lo puede esconder porque cada
		// una vive en su propio objeto con su propia forma.
		expect(result.accrued.platform_fees).toBe(150);
		expect(result.collected.platform_fees).toBe(90);
		expect(result.accrued.platform_fees).not.toBe(
			result.collected.platform_fees,
		);
	});

	it("no acepta montos negativos", () => {
		const result = RevenueStatsSchema.safeParse({
			...payload,
			collected: { ...payload.collected, business_net: -1 },
		});
		expect(result.success).toBe(false);
	});

	it("no acepta un período que no sea una fecha", () => {
		const result = RevenueStatsSchema.safeParse({
			...payload,
			period: { from: "01-09-2026", to: "2026-09-30" },
		});
		expect(result.success).toBe(false);
	});

	it("no acepta conteos de órdenes negativos", () => {
		const result = RevenueStatsSchema.safeParse({
			...payload,
			accrued: {
				...payload.accrued,
				orders: { ...payload.accrued.orders, completed: -1 },
			},
		});
		expect(result.success).toBe(false);
	});

	it("no acepta una comisión efectiva fuera de la fracción 0..1", () => {
		const result = RevenueStatsSchema.safeParse({
			...payload,
			accrued: { ...payload.accrued, effective_commission_rate: 10 },
		});
		expect(result.success).toBe(false);
	});
});
