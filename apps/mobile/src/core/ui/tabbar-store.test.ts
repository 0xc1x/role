import { describe, expect, it } from "bun:test";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

import { withSyncedTabIndex } from "@/src/core/ui/tabbar-store";

const routes = [
	{ key: "index-key", name: "index" },
	{ key: "explore-key", name: "explore" },
	{ key: "orders-key", name: "orders" },
	{ key: "profile-key", name: "profile" },
];

function fakeProps(index: number): BottomTabBarProps {
	return {
		state: { index, routes, key: "tab-state", routeNames: routes.map((r) => r.name) },
		descriptors: {},
		navigation: {},
		insets: { top: 0, right: 0, bottom: 0, left: 0 },
	} as unknown as BottomTabBarProps;
}

describe("withSyncedTabIndex", () => {
	it("adelanta el índice al segmento actual aunque el snapshot vaya un commit tarde", () => {
		const synced = withSyncedTabIndex(fakeProps(0), ["(consumer)", "orders"]);
		expect(synced.state.index).toBe(2);
	});

	it("resuelve la ruta index del grupo cuando no hay segmento de tab", () => {
		const synced = withSyncedTabIndex(fakeProps(2), ["(consumer)"]);
		expect(synced.state.index).toBe(0);
	});

	it("resuelve tabs con stack anidado desde el segmento padre", () => {
		const synced = withSyncedTabIndex(fakeProps(0), [
			"(consumer)",
			"profile",
			"settings",
		]);
		expect(synced.state.index).toBe(3);
	});

	it("devuelve la misma ref si el snapshot ya coincide (cero re-render extra)", () => {
		const props = fakeProps(2);
		expect(withSyncedTabIndex(props, ["(consumer)", "orders"])).toBe(props);
	});

	it("conserva el snapshot ante pushes de stack sobre los tabs (píldora quieta)", () => {
		const props = fakeProps(1);
		expect(withSyncedTabIndex(props, ["checkout"])).toBe(props);
		expect(withSyncedTabIndex(props, ["(consumer)", "checkout"])).toBe(props);
	});

	it("no inventa un tab index en grupos sin ruta index (business)", () => {
		const business = {
			state: {
				index: 2,
				routes: [
					{ key: "products-key", name: "products" },
					{ key: "orders-key", name: "orders" },
					{ key: "management-key", name: "management" },
				],
				key: "tab-state",
				routeNames: ["products", "orders", "management"],
			},
			descriptors: {},
			navigation: {},
			insets: { top: 0, right: 0, bottom: 0, left: 0 },
		} as unknown as BottomTabBarProps;
		expect(withSyncedTabIndex(business, ["(business)"])).toBe(business);
		expect(
			withSyncedTabIndex(business, ["(business)", "orders"]).state.index,
		).toBe(1);
	});
});
