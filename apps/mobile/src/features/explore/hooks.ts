import { useCallback, useEffect, useState } from "react";

import {
	emptyExploreFilters,
	type ExploreFilterState,
} from "@/features/explore/exploreTypes";
import type { ActiveFilterKey } from "@/features/explore/components/ExploreActiveFiltersBar";
import type { OfferFilterState } from "@/features/offers/domain/offer";

const SEARCH_DEBOUNCE_MS = 400;

/** Estado de filtros + búsqueda con debounce de Explorar. */
export function useExploreFilters() {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [filters, setFilters] = useState<ExploreFilterState>(emptyExploreFilters);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

	// Debounce la búsqueda (400ms).
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [search]);

	const handleCategoryTap = useCallback(
		(categoryId: string) => {
			// Toggle fuera del updater: los updaters deben ser puros.
			const next = selectedCategory === categoryId ? null : categoryId;
			setSelectedCategory(next);
			setFilters((f) => ({ ...f, category: next }));
		},
		[selectedCategory],
	);

	const clearFilter = useCallback((key: ActiveFilterKey) => {
		if (key === "searchQuery") {
			setSearch("");
			setDebouncedSearch("");
			setFilters((f) => ({ ...f, searchQuery: "" }));
			return;
		}
		setFilters((f) => ({ ...f, [key]: null }));
		if (key === "category") setSelectedCategory(null);
	}, []);

	const clearAllFilters = useCallback(() => {
		setSearch("");
		setDebouncedSearch("");
		setSelectedCategory(null);
		setFilters(emptyExploreFilters);
	}, []);

	const applySheetFilters = useCallback((sheetFilters: OfferFilterState) => {
		setFilters((f) => ({ ...f, ...sheetFilters }));
	}, []);

	return {
		search,
		setSearch,
		debouncedSearch,
		setDebouncedSearch,
		filters,
		setFilters,
		selectedCategory,
		handleCategoryTap,
		clearFilter,
		clearAllFilters,
		applySheetFilters,
	};
}
