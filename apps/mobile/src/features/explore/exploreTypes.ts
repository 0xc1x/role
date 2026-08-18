import type { OfferFilterState } from "@/features/offers/components/OfferFiltersSheet";

/** Filtros de Explorar: filtros del sheet + término de búsqueda libre. */
export interface ExploreFilterState extends OfferFilterState {
	searchQuery: string;
}

export const emptyExploreFilters: ExploreFilterState = {
	category: null,
	maxPrice: null,
	maxDistanceKm: null,
	searchQuery: "",
};

export function hasActiveExploreFilters(f: ExploreFilterState): boolean {
	return (
		f.category != null ||
		f.maxPrice != null ||
		f.maxDistanceKm != null ||
		f.searchQuery.length > 0
	);
}

/** Desglose de los filtros activos para mostrar en el header del mapa. */
export function exploreFilterSummary(
	f: ExploreFilterState,
	categoryName?: string,
): string[] {
	const parts: string[] = [];
	if (f.category != null)
		parts.push(categoryName ?? f.category ?? "");
	if (f.maxDistanceKm != null) parts.push(`${f.maxDistanceKm} km`);
	if (f.maxPrice != null) parts.push(`Max \$${f.maxPrice}`);
	return parts.filter((p) => p.length > 0);
}