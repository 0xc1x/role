import { describe, expect, it } from "bun:test";

import { meetsMinRole, type PanelMinRole } from "./panel-role";

/**
 * El filtro del panel por rol (§9.3).
 *
 * La regla es de AUTORIDAD: `owner` puede todo lo que puede `manager`, que
 * puede todo lo que puede `staff`. Y el mínimo se cierra: sin rol no se
 * ofrece configuración.
 */

describe("meetsMinRole", () => {
	it("el dueño alcanza el mínimo de gerente y el de cajero", () => {
		expect(meetsMinRole("owner", "owner")).toBe(true);
		expect(meetsMinRole("owner", "manager")).toBe(true);
		expect(meetsMinRole("owner", "staff")).toBe(true);
	});

	it("el gerente alcanza el mínimo de cajero, no el de dueño", () => {
		expect(meetsMinRole("manager", "manager")).toBe(true);
		expect(meetsMinRole("manager", "staff")).toBe(true);
		expect(meetsMinRole("manager", "owner")).toBe(false);
	});

	it("el cajero sólo alcanza su propio mínimo", () => {
		expect(meetsMinRole("staff", "staff")).toBe(true);
		expect(meetsMinRole("staff", "manager")).toBe(false);
		expect(meetsMinRole("staff", "owner")).toBe(false);
	});

	it("sin rol no se abre nada: el mínimo se cierra para todos", () => {
		const minRoles: PanelMinRole[] = ["owner", "manager", "staff"];
		for (const minRole of minRoles) {
			expect(meetsMinRole(null, minRole)).toBe(false);
		}
	});
});
