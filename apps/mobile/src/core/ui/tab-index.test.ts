import { describe, expect, it } from "bun:test";

import {
	filterVisibleRoutes,
	resolveActiveTabIndex,
	type TabRouteLike,
} from "@/core/ui/tab-index";

const routes: TabRouteLike[] = [
	{ key: "products-key", name: "products" },
	{ key: "orders-key", name: "orders" },
	{ key: "management-key", name: "management" },
	{ key: "hidden-key", name: "hidden-tab" },
];

const descriptors = {
	"hidden-key": { options: { tabBarItemStyle: { display: "none" } } },
};

const visibleRoutes = filterVisibleRoutes(routes, descriptors);

describe("filterVisibleRoutes", () => {
	it("excluye los tabs con tabBarItemStyle display none (href: null)", () => {
		expect(visibleRoutes.map((r) => r.name)).toEqual([
			"products",
			"orders",
			"management",
		]);
	});

	it("mantiene todos los tabs cuando ninguno está oculto", () => {
		const all = filterVisibleRoutes(routes, {});
		expect(all).toHaveLength(routes.length);
	});
});

describe("resolveActiveTabIndex", () => {
	it("devuelve el índice de la ruta activa cuando es un tab visible", () => {
		const state = { index: 1, routes };
		expect(resolveActiveTabIndex(state, visibleRoutes)).toBe(1);
	});

	it("devuelve el índice correcto entre solo las rutas visibles", () => {
		// management es la tercera ruta del estado, pero la tercera visible.
		const state = { index: 2, routes };
		expect(resolveActiveTabIndex(state, visibleRoutes)).toBe(2);
	});

	it("usa fallbackTabName cuando la activa no está entre las visibles (deep link)", () => {
		const state = { index: 3, routes };
		expect(resolveActiveTabIndex(state, visibleRoutes, "management")).toBe(2);
	});

	it("ignora un fallback que no existe entre los tabs visibles", () => {
		const state = { index: 3, routes };
		expect(resolveActiveTabIndex(state, visibleRoutes, "no-existe")).toBe(0);
	});

	it("cae en el primer tab visible sin fallback", () => {
		const state = { index: 3, routes };
		expect(resolveActiveTabIndex(state, visibleRoutes)).toBe(0);
	});
});
