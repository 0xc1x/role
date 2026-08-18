import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { EmptyState, ErrorState } from "@/core/ui";
import { SectionHeader } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useFilteredOffers, useSelectedAddress } from "@/features/hooks";
import {
	OfferFiltersSheet,
	type OfferFilterState,
} from "@/features/offers/components/OfferFiltersSheet";
import { ExploreHeader } from "@/features/explore/components/ExploreHeader";
import { ExploreActiveFiltersBar, type ActiveFilterKey } from "@/features/explore/components/ExploreActiveFiltersBar";
import { ExploreCategoryGrid } from "@/features/explore/components/ExploreCategoryGrid";
import { ExploreTipSection } from "@/features/explore/components/ExploreTipSection";
import { ExploreDealCard } from "@/features/explore/components/ExploreDealCard";
import { ExploreMapView } from "@/features/explore/components/ExploreMapView";
import {
	emptyExploreFilters,
	hasActiveExploreFilters,
	type ExploreFilterState,
} from "@/features/explore/exploreTypes";

const SEARCH_DEBOUNCE_MS = 400;

export default function ExploreScreen() {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [filters, setFilters] = useState<ExploreFilterState>(emptyExploreFilters);
	const [sheetVisible, setSheetVisible] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [viewModeMap, setViewModeMap] = useState(false);

	// Debounce la búsqueda como en fudi (400ms).
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [search]);

	const activeFilters: OfferFilterState = useMemo(
		() => ({
			category: filters.category,
			maxPrice: filters.maxPrice,
			maxDistanceKm: filters.maxDistanceKm,
		}),
		[filters.category, filters.maxPrice, filters.maxDistanceKm],
	);

	const { data, isLoading, isError, error, refetch } = useFilteredOffers({
		category: filters.category,
		maxPrice: filters.maxPrice,
		maxDistanceKm: filters.maxDistanceKm,
		lat: selectedAddress?.latitude ?? undefined,
		lng: selectedAddress?.longitude ?? undefined,
		searchQuery: debouncedSearch.length > 0 ? debouncedSearch : null,
	});

	const hasActiveFilters = hasActiveExploreFilters({
		...filters,
		searchQuery: debouncedSearch,
	});

	const applyFilters = useCallback((next: ExploreFilterState) => {
		setFilters(next);
	}, []);

	const openFilterSheet = useCallback(() => setSheetVisible(true), []);
	const closeFilterSheet = useCallback(() => setSheetVisible(false), []);
	const toggleViewMode = useCallback(() => setViewModeMap((m) => !m), []);

	const handleCategoryTap = useCallback((categoryId: string) => {
		setSelectedCategory((current) => {
			if (current === categoryId) {
				// Deseleccionar: limpia la categoría y sigue en la vista actual.
				setFilters((f) => ({ ...f, category: null }));
				return null;
			}
			// Seleccionar: aplica el filtro y cambia al mapa (como en fudi).
			setFilters((f) => ({ ...f, category: categoryId }));
			setViewModeMap(true);
			return categoryId;
		});
	}, []);

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

	if (viewModeMap) {
		return (
			<ExploreMapView
				offers={data ?? []}
				filters={{ ...filters, searchQuery: debouncedSearch }}
				userLocation={
					selectedAddress?.latitude != null
						? {
								latitude: selectedAddress.latitude,
								longitude: selectedAddress.longitude,
							}
						: null
				}
				onBack={toggleViewMode}
				onFilterTap={openFilterSheet}
			/>
		);
	}

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				<ExploreHeader
					search={search}
					onSearchChange={setSearch}
					onSubmitSearch={(q) => {
						setDebouncedSearch(q);
						setFilters((f) => ({ ...f, searchQuery: q }));
					}}
					onToggleMap={toggleViewMode}
					onFilterTap={openFilterSheet}
					hasActiveFilters={hasActiveFilters}
				/>

				{hasActiveFilters ? (
					<ExploreActiveFiltersBar
						filters={{ ...filters, searchQuery: debouncedSearch }}
						onClear={clearFilter}
						onClearAll={clearAllFilters}
					/>
				) : null}

				<ExploreCategoryGrid
					selectedCategory={selectedCategory}
					onCategoryTap={handleCategoryTap}
				/>

				<ExploreTipSection />

				<SectionHeader
					title={strings.explore.availableOffers}
					onSeeAll={() => router.push("/all-offers")}
					style={styles.offersHeader}
				/>

				{/* ── Ofertas ─────────────────────────────────────────── */}
				{isLoading ? (
					<View style={styles.offersList}>
						{[0, 1, 2, 3, 4].map((i) => (
							<View
								key={i}
								style={[styles.skeleton, { backgroundColor: colors.card }]}
							/>
						))}
					</View>
				) : isError ? (
					<ErrorState
						error={error}
						onRetry={() => void refetch()}
					/>
				) : data && data.length === 0 ? (
					<EmptyState
						title={strings.allOffers.noResultsTitle}
						message={strings.allOffers.noResultsBody}
					/>
				) : (
					<View style={styles.offersList}>
						{(data ?? []).map((offer) => (
							<ExploreDealCard key={offer.offer.id} offer={offer} />
						))}
					</View>
				)}
			</ScrollView>

			{sheetVisible ? (
				<OfferFiltersSheet
					current={activeFilters}
					onApply={applySheetFilters}
					onClose={closeFilterSheet}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	content: {
		paddingBottom: spacing.xxxl,
	},
	offersHeader: {
		paddingHorizontal: spacing.lg,
		marginTop: spacing.md,
	},
	offersList: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
		marginTop: spacing.sm,
	},
	skeleton: {
		height: 260,
		borderRadius: 16,
	},
});