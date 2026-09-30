import { describe, expect, it } from "bun:test";
import type { PayoutDto } from "@0xc1x/role-commons";
import { EMPTY_PAYOUT_TOTALS, sumPayoutTotals } from "../payout-totals";

function payout(over: Partial<PayoutDto> = {}): PayoutDto {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		business_id: "22222222-2222-4222-8222-222222222222",
		business_name: "Café Central",
		period_start: "2026-09-01",
		period_end: "2026-09-15",
		gross_amount: 100,
		platform_fee: 10,
		net_amount: 90,
		status: "paid",
		gateway_payout_id: null,
		paid_at: "2026-09-16T03:00:00.000Z",
		created_at: "2026-09-15T23:00:00.000Z",
		updated_at: "2026-09-16T03:00:00.000Z",
		...over,
	};
}

describe("sumPayoutTotals", () => {
	it("suma los tres importes y cuenta los cortes", () => {
		const totals = sumPayoutTotals([
			payout({ gross_amount: 100, platform_fee: 10, net_amount: 90 }),
			payout({ gross_amount: 50, platform_fee: 5, net_amount: 45 }),
		]);

		expect(totals).toEqual({
			count: 2,
			gross_amount: 150,
			platform_fee: 15,
			net_amount: 135,
		});
	});

	it("un conjunto vacío es cero, no undefined", () => {
		expect(sumPayoutTotals([])).toEqual(EMPTY_PAYOUT_TOTALS);
	});

	it("redondea a 2 decimales: sumar floats crudos deja basura", () => {
		// 0.1 + 0.2 en IEEE-754 da 0.30000000000000004. Un total de pagos que
		// arrastra esa cola se ve en la conciliación contra el banco.
		const totals = sumPayoutTotals([
			payout({ gross_amount: 0.1, platform_fee: 0, net_amount: 0.1 }),
			payout({ gross_amount: 0.2, platform_fee: 0, net_amount: 0.2 }),
		]);

		expect(totals.gross_amount).toBe(0.3);
		expect(totals.net_amount).toBe(0.3);
	});

	// El alcance no lo decide la suma: la reciben las filas. Este test fija que
	// la función NO deduplica ni agrupa — si lo hiciera, el total dejaría de
	// describir el conjunto que el recorrido le pasó.
	it("no deduplica: cuenta cada corte recibido una vez", () => {
		const row = payout();
		const totals = sumPayoutTotals([row, row, row]);

		expect(totals.count).toBe(3);
		expect(totals.gross_amount).toBe(300);
	});
});
