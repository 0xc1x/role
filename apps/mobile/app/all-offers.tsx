import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Search, SlidersHorizontal } from "lucide-react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import {
	goBackOr,
	AppText,
	CircleIconButton,
	EmptyState,
	FilterChip,
	SearchBar,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useCategories, useFilteredOffersInfinite, useSelectedAddress } from "@/src/features/hooks";
import { useAuthStore } from "@/src/features/auth/store";
import { usePreferences } from "@/src/features/profile/hooks";
import { OfferGridCard } from "@/src/features/offers/components/OfferGridCard";
import { OfferFiltersSheet } from "@/src/features/offers/components/OfferFiltersSheet";
import {
	emptyOfferFilters,
	type OfferFilterState,
} from "@/src/features/offers/domain/offer";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const SEARCH_DEBOUNCE_MS = 400;

const SKELETON_DATA = [0, 1, 2, 3, 4, 5];

type OfferGridItem = ComponentProps<typeof OfferGridCard>["offer"];

const SkeletonRow = memo(function SkeletonRow() {
	return <Skeleton style={styles.skeletonCard} />;
});

function renderSkeletonItem() {
	return <SkeletonRow />;
}

const OfferRow = memo(function OfferRow({ item }: { item: OfferGridItem }) {
	return (
		<View style={styles.gridItem}>
			<OfferGridCard offer={item} />
		</View>
	);
});

function ListFooter({
	isFetchingNextPage,
	hasNextPage,
	hasData,
}: {
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	hasData: boolean;
}) {
	const { colors } = useTheme();
	if (isFetchingNextPage) {
		return (
			<View style={{ padding: spacing.lg, alignItems: "center" }}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					Cargando más…
				</AppText>
			</View>
		);
	}
	if (hasNextPage || !hasData) return null;
	return (
		<View style={{ padding: spacing.lg, alignItems: "center" }}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				No hay más ofertas
			</AppText>
		</View>
	);
}

export default function AllOffersScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
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
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: !!isFetching,
	});

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

	const renderItem = useCallback(
		({ item }: { item: OfferGridItem }) => <OfferRow item={item} />,
		[],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const listFooter = useMemo(
		() => (
			<ListFooter
				isFetchingNextPage={isFetchingNextPage}
				hasNextPage={hasNextPage ?? false}
				hasData={data.length > 0}
			/>
		),
		[isFetchingNextPage, hasNextPage, data.length],
	);

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{pull.indicator}
			{/* Header */}
			<View style={[styles.header, { paddingTop: spacing.xl + insets.top }]}>
				<View style={styles.headerRow}>
					<CircleIconButton
						icon={
							<ChevronLeft size={22} color={colors.foreground} />
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
				<Button
					variant="outline"
					size="sm"
					onPress={() => setSheetVisible(true)}
					icon={<SlidersHorizontal size={16} color={colors.foreground} />}
				>
					{hasActiveFilters ? `${strings.allOffers.filters} •` : strings.allOffers.filters}
				</Button>
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
					<Button variant="link" onPress={clearAll} hitSlop={8}>
						{strings.allOffers.clear}
					</Button>
				</View>
			) : null}

			{/* Grid */}
			{isGuest ? (
				<View style={styles.centerBox}>
					<EmptyState title={strings.explore.loginRequiredTitle} message={strings.explore.loginRequiredBody} />
					<Button  onPress={() => router.push("/login")} style={{ marginTop: spacing.lg }} >
						{strings.explore.loginCTA}
					</Button>	
				</View>
			) : isLoading ? (
				<View style={styles.gridContainer}>
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(i) => String(i)}
						numColumns={2}
						columnWrapperStyle={styles.gridRow}
						contentContainerStyle={styles.gridContent}
						scrollEnabled={false}
						renderItem={renderSkeletonItem}
					/>
				</View>
			) : isError ? (
				<View style={styles.centerBox}>
					<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
						{error instanceof Error ? error.message : strings.common.error}
					</AppText>
					<Button onPress={() => void refetch()}>
						{strings.common.retry}
					</Button>
				</View>
			) : data && data.length === 0 ? (
				<View style={styles.centerBox}>
					<Search size={44} color={colors.mutedForeground} />
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
					ref={pull.ref}
					data={data}
					keyExtractor={(item) => item.offer.id}
					numColumns={2}
					columnWrapperStyle={styles.gridRow}
					contentContainerStyle={styles.gridContent}
					showsVerticalScrollIndicator={false}
					refreshControl={<RefreshControl refreshing={!!isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
					onEndReached={handleEndReached}
					onEndReachedThreshold={0.5}
					ListFooterComponent={listFooter}
					renderItem={renderItem}
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
		borderRadius: radii.md,
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
		borderRadius: radii.md,
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
		borderRadius: radii.md,
	},
});