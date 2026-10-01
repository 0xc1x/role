import { describe, expect, test } from "bun:test";
import { bugReportKeys } from "../bug-reports.keys";

/**
 * La jerarquía de la key es lo que hace que la invalidación del triaje sea
 * precisa: `lists()` matchea todas las páginas con cualquier filtro, y
 * `detail(id)` solo la de ese reporte. Si `list()` no colgara de `lists()`, un
 * `invalidateQueries` sobre las listas dejaría de alcanzar al listado — que es
 * justamente lo que hay que invalidar después de un triaje.
 */
describe("bugReportKeys", () => {
	test("all returns base key", () => {
		expect(bugReportKeys.all).toEqual(["bug-report-inbox"]);
	});

	test("lists returns list subset", () => {
		expect(bugReportKeys.lists()).toEqual(["bug-report-inbox", "list"]);
	});

	test("list with filters as params", () => {
		const params = { page: 1, limit: 20, state: "ABIERTO", origin: "ios" };
		expect(bugReportKeys.list(params)).toEqual([
			"bug-report-inbox",
			"list",
			params,
		]);
	});

	test("details returns detail subset", () => {
		expect(bugReportKeys.details()).toEqual(["bug-report-inbox", "detail"]);
	});

	test("detail with id", () => {
		expect(
			bugReportKeys.detail("11111111-1111-4111-8111-111111111111"),
		).toEqual([
			"bug-report-inbox",
			"detail",
			"11111111-1111-4111-8111-111111111111",
		]);
	});
});
