import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/core/i18n/strings";
import { Button, EmptyState, ErrorState, LoadingView, useWebPullToRefresh } from "@/core/ui";
import { SectionHeader } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useFilteredOffers, useSelectedAddress } from "@/features/hooks";
import { useAuthStore } from "@/features/auth/store";
import { usePreferences } from "@/features/profile/hooks";
import {
	OfferFiltersSheet,
	type OfferFilterState,
} from "@/features/offers/components/OfferFiltersSheet";
import { ExploreHeader } from "@/features/explore/components/ExploreHeader";
import { ExploreActiveFiltersBar } from "@/features/explore/components/ExploreActiveFiltersBar";
import { ExploreCategoryGrid } from "@/features/explore/components/ExploreCategoryGrid";
import { ExploreTipSection } from "@/features/explore/components/ExploreTipSection";
import { OfferCard } from "@/features/offers/components/OfferCard";
import { ExploreMapView } from "@/features/explore/components/ExploreMapView";
import {
	hasActiveExploreFilters,
} from "@/features/explore/exploreTypes";
import { useExploreFilters } from "@/features/explore/hooks";

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
	const { data, isLoading, isError, error, refetch, isFetching } = useFilteredOffers({
		category: filters.category,
		maxPrice: filters.maxPrice,
		maxDistanceKm: effectiveMaxDistanceKm,
		lat: selectedAddress?.latitude ?? undefined,
		lng: selectedAddress?.longitude ?? undefined,
		searchQuery: debouncedSearch.length > 0 ? debouncedSearch : null,
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
					<Button label={strings.explore.loginCTA} onPress={() => router.push("/login")} style={{ marginTop: spacing.lg }} />
				</View>
			);
		}
		return (
			<View style={styles.flex}>
				{isLoading && !data ? (
					<LoadingView />
				) : (
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
					onCategoryTap={handleCategoryTapWithMap}
					onCollapse={handleCollapseCategories}
				/>

				<ExploreTipSection />

				<SectionHeader
					title={strings.explore.availableOffers}
					onSeeAll={() => router.push("/all-offers")}
					style={styles.offersHeader}
				/>

				{/* ── Ofertas ─────────────────────────────────────────── */}
				{isGuest ? (
					<View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md, alignItems: "center" }}>
						<EmptyState title={strings.explore.loginRequiredTitle} message={strings.explore.loginRequiredBody} />
						<Button label={strings.explore.loginCTA} onPress={() => router.push("/login")} />
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
						onRetry={() => void refetch()}
					/>
				) : data && data.length === 0 ? (
					<EmptyState
						title={strings.allOffers.noResultsTitle}
						message={strings.allOffers.noResultsBody}
					/>
				) : (
					<View style={styles.offersList}>
						{(data ?? []).slice(0, 8).map((offer) => (
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
		borderRadius: 16,
	},
});