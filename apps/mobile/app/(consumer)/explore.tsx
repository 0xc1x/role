import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import { EmptyState, ErrorState, LoadingView, useWebPullToRefresh } from "@/src/core/ui";
import { SectionHeader } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useFilteredOffers, useSelectedAddress } from "@/src/features/hooks";
import { useAuthStore } from "@/src/features/auth/store";
import { usePreferences } from "@/src/features/profile/hooks";
import {
	OfferFiltersSheet,
	type OfferFilterState,
} from "@/src/features/offers/components/OfferFiltersSheet";
import { ExploreHeader } from "@/src/features/explore/components/ExploreHeader";
import { ExploreActiveFiltersBar } from "@/src/features/explore/components/ExploreActiveFiltersBar";
import { ExploreCategoryGrid } from "@/src/features/explore/components/ExploreCategoryGrid";
import { ExploreTipSection } from "@/src/features/explore/components/ExploreTipSection";
import { OfferCard } from "@/src/features/offers/components/OfferCard";
import { ExploreMapView } from "@/src/features/explore/components/ExploreMapView";
import {
	hasActiveExploreFilters,
} from "@/src/features/explore/exploreTypes";
import { useExploreFilters } from "@/src/features/explore/hooks";
import { Button } from "@/components/ui/button";

export default function ExploreScreen() {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();
	const profile = useAuthStore((s) => s.profile);
	const { data: preferences } = usePreferences(profile?.id ?? "");
	const isGuest = !profile;
	const prefRadius = preferences?.notification_radius_km ?? 5;

	const {
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
	} = useExploreFilters();
	const [sheetVisible, setSheetVisible] = useState(false);
	const [viewModeMap, setViewModeMap] = useState(false);
	const scrollRef = useRef<ScrollView>(null);

	const activeFilters: OfferFilterState = useMemo(
		() => ({
			category: filters.category,
			maxPrice: filters.maxPrice,
			maxDistanceKm: filters.maxDistanceKm,
		}),
		[filters.category, filters.maxPrice, filters.maxDistanceKm],
	);

	const effectiveMaxDistanceKm = filters.maxDistanceKm ?? (isGuest ? null : prefRadius);
	// Preview section shows 8 cards — cap server-side instead of slicing 100 rows client-side.
	const { data, isLoading, isError, error, refetch, isFetching } = useFilteredOffers({
		category: filters.category,
		maxPrice: filters.maxPrice,
		maxDistanceKm: effectiveMaxDistanceKm,
		lat: selectedAddress?.latitude ?? undefined,
		lng: selectedAddress?.longitude ?? undefined,
		searchQuery: debouncedSearch.length > 0 ? debouncedSearch : null,
		limit: 8,
	});

	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const hasActiveFilters = hasActiveExploreFilters({
		...filters,
		searchQuery: debouncedSearch,
	});

	const openFilterSheet = useCallback(() => setSheetVisible(true), []);
	const closeFilterSheet = useCallback(() => setSheetVisible(false), []);
	const toggleViewMode = useCallback(() => setViewModeMap((m) => !m), []);
	const handleSubmitSearch = useCallback(
		(q: string) => {
			setDebouncedSearch(q);
			setFilters((f) => ({ ...f, searchQuery: q }));
		},
		[setDebouncedSearch, setFilters],
	);
	const handleRetry = useCallback(() => void refetch(), [refetch]);
	const handleSeeAllOffers = useCallback(() => router.push("/all-offers"), []);
	const handleLoginPress = useCallback(() => router.push("/login"), []);
	// Remonta el mapa al cambiar filtros: reinicia selección y encuadre sin efectos.
	const mapResetKey = JSON.stringify({ ...filters, searchQuery: debouncedSearch });

	const handleCategoryTapWithMap = useCallback(
		(categoryId: string) => {
			// Seleccionar: aplica el filtro y cambia al mapa; deseleccionar:
			// limpia la categoría y sigue en la vista actual.
			if (selectedCategory !== categoryId) setViewModeMap(true);
			handleCategoryTap(categoryId);
		},
		[selectedCategory, handleCategoryTap],
	);

	const handleCollapseCategories = useCallback(() => {
		// deja que LayoutAnimation arranque y luego hace scroll suave arriba
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({ y: 0, animated: true });
		});
	}, []);

	if (viewModeMap) {
		if (isGuest) {
			return (
				<View style={[styles.flex, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
					<EmptyState title={strings.explore.loginRequiredTitle} message={strings.explore.loginRequiredBody} />
					<Button onPress={handleLoginPress} style={{ marginTop: spacing.lg }} >
						{strings.explore.loginCTA}
					</Button>	
				</View>
			);
		}
		return (
			<View style={styles.flex}>
				{isLoading && !data ? (
					<LoadingView />
				) : (
					<ExploreMapView
						key={mapResetKey}
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
				)}
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

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{pull.indicator}
			<ScrollView
				ref={(instance) => {
					scrollRef.current = instance;
					pull.ref(instance);
				}}
				style={styles.flex}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				refreshControl={
					<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />
				}
			>
				<ExploreHeader
					search={search}
					onSearchChange={setSearch}
					onSubmitSearch={handleSubmitSearch}
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
					onCategoryTap={handleCategoryTapWithMap}
					onCollapse={handleCollapseCategories}
				/>

				<ExploreTipSection />

				<SectionHeader
					title={strings.explore.availableOffers}
					onSeeAll={handleSeeAllOffers}
					style={styles.offersHeader}
				/>

				{/* ── Ofertas ─────────────────────────────────────────── */}
				{isGuest ? (
					<View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md, alignItems: "center" }}>
						<EmptyState title={strings.explore.loginRequiredTitle} message={strings.explore.loginRequiredBody} />
						<Button onPress={handleLoginPress} >
							{strings.explore.loginCTA}
						</Button>
					</View>
				) : isLoading ? (
					<View style={styles.offersList}>
						{[0, 1, 2, 3, 4].map((i) => (
							<Skeleton key={i} style={styles.skeleton} />
						))}
					</View>
				) : isError ? (
					<ErrorState
						error={error}
						onRetry={handleRetry}
					/>
				) : data && data.length === 0 ? (
					<EmptyState
						title={strings.allOffers.noResultsTitle}
						message={strings.allOffers.noResultsBody}
					/>
				) : (
					<View style={styles.offersList}>
						{(data ?? []).map((offer) => (
							<OfferCard key={offer.offer.id} offer={offer} />
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
		borderRadius: radii.md,
	},
});