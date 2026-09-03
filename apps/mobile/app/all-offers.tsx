import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/core/i18n/strings";
import {
	goBackOr,
	AppText,
	Button,
	CircleIconButton,
	EmptyState,
	FilterChip,
	SearchBar,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useCategories, useFilteredOffersInfinite, useSelectedAddress } from "@/features/hooks";
import { useAuthStore } from "@/features/auth/store";
import { usePreferences } from "@/features/profile/hooks";
import { OfferGridCard } from "@/features/offers/components/OfferGridCard";
import {
	OfferFiltersSheet,
	emptyOfferFilters,
	type OfferFilterState,
} from "@/features/offers/components/OfferFiltersSheet";

const SEARCH_DEBOUNCE_MS = 400;

export default function AllOffersScreen() {
	const { colors } = useTheme();
	const params = useLocalSearchParams<{ category?: string }>();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [filters, setFilters] = useState<OfferFilterState>(() =>
		params.category
			? { ...emptyOfferFilters, category: params.category }
			: emptyOfferFilters,
	);
	const [sheetVisible, setSheetVisible] = useState(false);

	const selectedAddress = useSelectedAddress();
	const { data: categories } = useCategories();
	const profile = useAuthStore((s) => s.profile);
	const { data: preferences } = usePreferences(profile?.id ?? "");
	const isGuest = !profile;
	const prefRadius = preferences?.notification_radius_km ?? 5;
	const effectiveMaxDistanceKm = filters.maxDistanceKm ?? (isGuest ? null : prefRadius);
	const { data: infiniteData, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useFilteredOffersInfinite({
		category: filters.category,
		maxPrice: filters.maxPrice,
		maxDistanceKm: effectiveMaxDistanceKm,
		lat: selectedAddress?.latitude ?? undefined,
		lng: selectedAddress?.longitude ?? undefined,
		searchQuery: debouncedSearch.length > 0 ? debouncedSearch : null,
	});
	const data = useMemo(() => infiniteData?.pages.flat() ?? [], [infiniteData]);

	// Debounce the search input.
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [search]);

	// If navigated with a category param (e.g. home "ver todo"), reflect it.
	const hasActiveFilters =
		filters.category != null ||
		filters.maxPrice != null ||
		filters.maxDistanceKm != null ||
		debouncedSearch.length > 0;

	const catName = useMemo(() => {
		if (!filters.category) return null;
		return (
			categories?.find((c) => c.id === filters.category)?.name ??
			filters.category
		);
	}, [categories, filters.category]);

	const clearFilter = useCallback((key: keyof OfferFilterState | "search") => {
		if (key === "search") {
			setSearch("");
			setDebouncedSearch("");
			return;
		}
		setFilters((s) => ({ ...s, [key]: null }));
	}, []);

	const clearAll = useCallback(() => {
		setSearch("");
		setDebouncedSearch("");
		setFilters(emptyOfferFilters);
	}, []);

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{/* Header */}
			<View style={styles.header}>
				<View style={styles.headerRow}>
					<CircleIconButton
						icon={
							<Ionicons name="chevron-back" size={22} color={colors.foreground} />
						}
						onPress={() => goBackOr("/(consumer)")}
						accessibilityLabel={strings.common.back}
					/>
					<AppText variant="h2" weight="bold">
						{strings.allOffers.title}
					</AppText>
				</View>
				<SearchBar
					value={search}
					onChangeText={setSearch}
					placeholder={strings.allOffers.searchHint}
				/>
				<Pressable
					onPress={() => setSheetVisible(true)}
					style={[
						styles.filtersPill,
						{
							borderColor: colors.borderSolid,
							backgroundColor: colors.card,
						},
					]}
				>
					<Ionicons name="options-outline" size={16} color={colors.foreground} />
					<AppText variant="bodySmall" weight="semiBold">
						{strings.allOffers.filters}
					</AppText>
					{hasActiveFilters ? (
						<View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
					) : null}
				</Pressable>
			</View>

			{/* Active filters chips */}
			{hasActiveFilters ? (
				<View style={styles.activeFilters}>
					<View style={styles.activeChips}>
						{catName ? (
							<FilterChip label={catName} onClear={() => clearFilter("category")} />
						) : null}
						{filters.maxDistanceKm != null ? (
							<FilterChip
								label={`${filters.maxDistanceKm} ${strings.allOffers.km}`}
								onClear={() => clearFilter("maxDistanceKm")}
							/>
						) : null}
						{filters.maxPrice != null ? (
							<FilterChip
								label={strings.allOffers.price.replace(
									"{n}",
									`$${filters.maxPrice}`,
								)}
								onClear={() => clearFilter("maxPrice")}
							/>
						) : null}
						{debouncedSearch.length > 0 ? (
							<FilterChip
								label={`"${debouncedSearch}"`}
								onClear={() => clearFilter("search")}
							/>
						) : null}
					</View>
					<Pressable onPress={clearAll} hitSlop={8}>
						<AppText
							variant="bodySmall"
							weight="semiBold"
							style={{ color: colors.primary }}
						>
							{strings.allOffers.clear}
						</AppText>
					</Pressable>
				</View>
			) : null}

			{/* Grid */}
			{isGuest ? (
				<View style={styles.centerBox}>
					<EmptyState title={strings.explore.loginRequiredTitle} message={strings.explore.loginRequiredBody} />
					<Button label={strings.explore.loginCTA} onPress={() => router.push("/login")} style={{ marginTop: spacing.lg }} />
				</View>
			) : isLoading ? (
				<View style={styles.gridContainer}>
					<FlatList
						data={[0, 1, 2, 3, 4, 5]}
						keyExtractor={(i) => String(i)}
						numColumns={2}
						columnWrapperStyle={styles.gridRow}
						contentContainerStyle={styles.gridContent}
						scrollEnabled={false}
						renderItem={() => <Skeleton style={styles.skeletonCard} />}
					/>
				</View>
			) : isError ? (
				<View style={styles.centerBox}>
					<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
						{error instanceof Error ? error.message : strings.common.error}
					</AppText>
					<Pressable
						onPress={() => void refetch()}
						style={[styles.retry, { backgroundColor: colors.primary }]}
					>
						<AppText weight="bold" style={{ color: colors.primaryForeground }}>
							{strings.common.retry}
						</AppText>
					</Pressable>
				</View>
			) : data && data.length === 0 ? (
				<View style={styles.centerBox}>
					<Ionicons name="search" size={44} color={colors.mutedForeground} />
					<AppText variant="h4" weight="bold" style={{ marginTop: spacing.md }}>
						{strings.allOffers.noResultsTitle}
					</AppText>
					<AppText
						variant="bodyMedium"
						style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
					>
						{strings.allOffers.noResultsBody}
					</AppText>
				</View>
			) : (
				<FlatList
					data={data}
					keyExtractor={(item) => item.offer.id}
					numColumns={2}
					columnWrapperStyle={styles.gridRow}
					contentContainerStyle={styles.gridContent}
					showsVerticalScrollIndicator={false}
					refreshControl={<RefreshControl refreshing={!!isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
					onEndReached={() => {
						if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					ListFooterComponent={
						isFetchingNextPage ? (
							<View style={{ padding: spacing.lg, alignItems: "center" }}>
								<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
									Cargando más…
								</AppText>
							</View>
						) : hasNextPage ? null : data.length > 0 ? (
							<View style={{ padding: spacing.lg, alignItems: "center" }}>
								<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
									No hay más ofertas
								</AppText>
							</View>
						) : null
					}
					renderItem={({ item }) => (
						<View style={styles.gridItem}>
							<OfferGridCard offer={item} />
						</View>
					)}
				/>
			)}

			{sheetVisible ? (
				<OfferFiltersSheet
					current={filters}
					onApply={(next) => setFilters(next)}
					onClose={() => setSheetVisible(false)}
				/>
			) : null}
		</View>
	);
}

const GRID_GAP = spacing.md;

const styles = StyleSheet.create({
	flex: { flex: 1 },
	header: {
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		gap: spacing.md,
		paddingVertical: spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	filtersPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		alignSelf: "flex-start",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: 12,
		borderWidth: 1,
	},
	activeDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	activeFilters: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
	},
	activeChips: {
		flex: 1,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	gridContainer: {
		flex: 1,
	},
	gridContent: {
		padding: spacing.xl,
		gap: spacing.md,
		paddingTop: spacing.sm,
	},
	gridRow: {
		gap: GRID_GAP,
	},
	gridItem: {
		flex: 1,
	},
	skeletonCard: {
		flex: 1,
		height: 220,
		borderRadius: 16,
	},	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
	},
	retry: {
		marginTop: spacing.lg,
		paddingHorizontal: 24,
		paddingVertical: spacing.md,
		borderRadius: 12,
	},
});