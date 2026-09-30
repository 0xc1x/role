import { describe, expect, test } from "bun:test";
import { payoutsKeys } from "../payouts.keys";

describe("payoutsKeys", () => {
	test("all returns base key", () => {
		expect(payoutsKeys.all).toEqual(["payouts"]);
	});

	test("lists returns list subset", () => {
		expect(payoutsKeys.lists()).toEqual(["payouts", "list"]);
	});

	test("list with undefined params", () => {
		expect(payoutsKeys.list()).toEqual(["payouts", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, status: "pending" };
		expect(payoutsKeys.list(params)).toEqual(["payouts", "list", params]);
	});

	// Los totales comparten el prefijo `payouts` a propósito: marcar un corte como
	// pagado invalida `payoutsKeys.all` y con eso los totales se refrescan solos.
	// Sin ese prefijo compartido, la tabla mostraría el corte pagado y el total
	// seguiría sumando el conjunto viejo.
	test("totals cuelga de all para heredarle la invalidación", () => {
		const params = { page: 1, limit: 20, status: "paid" };
		expect(payoutsKeys.totals(params)).toEqual(["payouts", "totals", params]);
		expect(payoutsKeys.totals(params)).toHaveLength(payoutsKeys.all.length + 2);
	});

	// Los totales de "pagados" y de "pendientes" no son el mismo número: el filtro
	// tiene que distinguir las keys o React Query serviría el conjunto anterior.
	test("totals con el filtro distinto son keys distintas", () => {
		expect(payoutsKeys.totals({ status: "paid" })).not.toEqual(
			payoutsKeys.totals({ status: "pending" }),
		);
	});

	test("totals con undefined params", () => {
		expect(payoutsKeys.totals()).toEqual(["payouts", "totals", {}]);
	});
});
