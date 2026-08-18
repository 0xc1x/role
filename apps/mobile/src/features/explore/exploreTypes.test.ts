import { describe, expect, it } from "vitest";

import {
	emptyExploreFilters,
	exploreFilterSummary,
	hasActiveExploreFilters,
} from "@/features/explore/exploreTypes";

describe("hasActiveExploreFilters", () => {
	it("es false cuando no hay filtros", () => {
		expect(hasActiveExploreFilters(emptyExploreFilters)).toBe(false);
	});

	it("detecta categoría, precio máximo y distancia máxima", () => {
		expect(hasActiveExploreFilters({ ...emptyExploreFilters, category: "c1" })).toBe(true);
		expect(hasActiveExploreFilters({ ...emptyExploreFilters, maxPrice: 5 })).toBe(true);
		expect(
			hasActiveExploreFilters({ ...emptyExploreFilters, maxDistanceKm: 5 }),
		).toBe(true);
	});

	it("detecta la búsqueda solo si tiene texto", () => {
		expect(hasActiveExploreFilters({ ...emptyExploreFilters, searchQuery: "" })).toBe(false);
		expect(hasActiveExploreFilters({ ...emptyExploreFilters, searchQuery: "pizza" })).toBe(
			true,
		);
	});
});

describe("exploreFilterSummary", () => {
	it("devuelve lista vacía sin filtros", () => {
		expect(exploreFilterSummary(emptyExploreFilters)).toEqual([]);
	});

	it("resuelve el nombre de categoría si se pasa", () => {
		const filters = { ...emptyExploreFilters, category: "c1", maxDistanceKm: 5 };
		expect(exploreFilterSummary(filters, "Panadería")).toEqual([
			"Panadería",
			"5 km",
		]);
	});

	it("omite partes vacías", () => {
		const filters = { ...emptyExploreFilters, maxPrice: 10 };
		expect(exploreFilterSummary(filters)).toEqual(["Max $10"]);
	});
});