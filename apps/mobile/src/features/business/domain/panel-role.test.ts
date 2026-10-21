import { describe, expect, it } from "bun:test";

import type { BusinessMemberRole } from "@/src/features/business/domain/business";
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

	it("un rol fuera del vocabulario tampoco abre nada", () => {
		// El rango es una tabla: un rol que no está en ella no tiene rango, y
		// la comparación sale `false` —el mínimo se cierra— igual que con
		// `null`. El `cast` es por el type, que es un vocabulario cerrado; el
		// runtime es el que decide.
		expect(
			meetsMinRole("owner_2" as unknown as BusinessMemberRole, "staff"),
		).toBe(false);
	});
});
