import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Package, Plus } from "lucide-react-native";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	FilterChip,
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/src/features/auth/store";
import {
	useBusinesses,
	useBusinessLocations,
	useBusinessOfferCount,
	useBusinessOffers,
} from "@/src/features/business/hooks";
import {
	filterAndSortProducts,
	productStats,
	productsSortToOrder,
	type ProductsSort,
} from "@/src/features/business/domain/products";
import { NoBusinessPrompt } from "@/src/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/src/features/business/components/products/BranchSelector";
import { BusinessStatsRow, BusinessStatsRowSkeleton } from "@/src/features/business/components/products/BusinessStatsRow";
import { ProductsSortControl } from "@/src/features/business/components/products/ProductsSortControl";
import { ProductFilters } from "@/src/features/business/components/products/ProductFilters";
import { ProductCard, ProductCardSkeleton } from "@/src/features/business/components/products/ProductCard";
import { useCategories } from "@/src/features/hooks";
import { spacing, radii } from "@/src/core/theme/spacing";
import { typography } from "@/src/core/theme/typography";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export default function BusinessProductsScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";

	const { data: locations } = useBusinessLocations(businessId);
	// Branch + search + category + sort all filter server-side
	// (`offer_categories!inner` + `order()`); the client filter below only
	// re-applies over already-filtered pages (idempotent, no-op).
	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const [sort, setSort] = useState<ProductsSort>("newest");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const search =
		debouncedSearch.length > 0 ? debouncedSearch : undefined;
	const { orderBy, ascending } = productsSortToOrder(sort);

	const {
		data: infiniteData,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useBusinessOffers(businessId, {
		locationId: branchId,
		search,
		categoryId,
		orderBy,
		ascending,
	});
	const { data: totalCount } = useBusinessOfferCount(businessId);
	// activeCount scoped to the same filters as the list (exact); sold and
	// available have no server aggregate, so they sum loaded pages (labeled).
	const { data: activeCount } = useBusinessOfferCount(businessId, {
		isActive: true,
		locationId: branchId,
		search,
		categoryId,
	});
	const { data: categories } = useCategories();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	useEffect(() => {
		setBranchId(null);
		setSearchInput("");
		setDebouncedSearch("");
		setCategoryId(null);
		setSort("newest");
	}, [businessId]);

	const items = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);
	const filtered = useMemo(
		() =>
			filterAndSortProducts(items, {
				branchId: null,
				searchQuery: "",
				categoryId,
				sort,
			}),
		[items, categoryId, sort],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const stats = useMemo(() => {
		// activeCount is a server head-count scoped to the list filters;
		// sold/available are sums with no server aggregate, so they reflect
		// loaded pages only (labeled under the row).
		// Tolerates undefined inputs so the skeleton branch can render above.
		const pageStats = productStats(items);
		return { ...pageStats, activeCount: activeCount ?? pageStats.activeCount };
	}, [items, activeCount]);

	const renderItem = useCallback(
		({ item: product }: { item: (typeof filtered)[number] }) => (
			<ProductCard businessId={businessId} product={product} />
		),
		[businessId],
	);

	const renderSeparator = useCallback(
		() => <View style={styles.separator} />,
		[],
	);

	if (businessesLoading || !business) {
		if (!businessesLoading && !business) {
			return <NoBusinessPrompt />;
		}
		return (
			<Screen edges={["top", "left", "right"]}>
				<View style={styles.header}>
					<Skeleton style={styles.skeletonTitle} />
					<Skeleton style={styles.skeletonPill} />
				</View>
				<ScrollView
					style={styles.list}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.headerContainer}>
						<BusinessStatsRowSkeleton />
						<Skeleton style={styles.ctaSkeleton} />
						<View style={styles.sectionHeader}>
							<Skeleton style={styles.sectionTitleSkeleton} />
							<Skeleton style={styles.sortSkeleton} />
						</View>
						<View style={styles.searchRow}>
							<Skeleton style={styles.searchSkeleton} />
						</View>
						<View style={styles.filterRow}>
							<Skeleton style={styles.filterSkeleton} />
						</View>
						<View style={styles.listSkeleton}>
							{[0, 1, 2].map((i) => (
								<ProductCardSkeleton key={`products-skeleton-${i}`} />
							))}
						</View>
					</View>
				</ScrollView>
			</Screen>
		);
	}

	const activeCategoryName = categories?.find(
		(c) => c.id === categoryId,
	)?.name;

	const createRoute = () => router.push(`/business/${businessId}/offer/new`);

	return (
		<Screen edges={["top", "left", "right"]}>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.productsTitle}
				</AppText>
				{locations && locations.length > 0 ? (
					<BranchSelector
						locations={locations}
						selectedId={branchId}
						onSelect={setBranchId}
					/>
				) : null}
			</View>

			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={filtered}
				keyExtractor={(product) => product.offer.id}
				renderItem={renderItem}
				ItemSeparatorComponent={renderSeparator}
				showsVerticalScrollIndicator={false}
				style={styles.list}
				contentContainerStyle={styles.content}
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListFooterComponent={
					isFetchingNextPage ? (
						<ActivityIndicator color={colors.primary} />
					) : null
				}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						{isLoading ? (
							<BusinessStatsRowSkeleton />
						) : (
							<>
								<BusinessStatsRow stats={stats} />
								<AppText
									variant="bodySmall"
									style={{ color: colors.mutedForeground }}
								>
									{strings.business.productsStatsScopeNote}
								</AppText>
							</>
						)}

						<Button
							icon={<Plus size={20} color={colors.primaryForeground} />}
							onPress={createRoute}
							fullWidth
							size="lg"
							style={styles.cta}
						>
							{strings.business.newProduct}
						</Button>

						<View style={styles.sectionHeader}>
							<AppText variant="h4" weight="bold">
								{strings.business.allProducts}
							</AppText>
							<ProductsSortControl value={sort} onChange={setSort} />
						</View>

						<View style={styles.searchRow}>
							<SearchBar
								value={searchInput}
								onChangeText={setSearchInput}
								placeholder={strings.business.searchProducts}
								containerStyle={styles.searchBarFull}
							/>
						</View>
						<View style={styles.filterRow}>
							<ProductFilters activeCategoryId={categoryId} onApply={setCategoryId} />
						</View>

						{categoryId ? (
							<View style={styles.chipsRow}>
								<FilterChip
									label={activeCategoryName ?? categoryId}
									onClear={() => setCategoryId(null)}
								/>
							</View>
						) : null}

						{isLoading ? (
							<View style={styles.listSkeleton}>
								{[0, 1, 2].map((i) => (
									<ProductCardSkeleton key={`products-skeleton-${i}`} />
								))}
							</View>
						) : null}
						{isError ? (
							<ErrorState error={error} onRetry={() => void refetch()} />
						) : null}

						{!isLoading && !isError && totalCount === 0 ? (
							<EmptyState
								icon={
<Package
									size={28}
									color={colors.mutedForeground}
								/>
								}
								title={strings.business.noProductsTitle}
								message={strings.business.noProductsBody}
								action={
									<Button
										icon={<Plus size={20} color={colors.primaryForeground} />}
										onPress={createRoute}
										fullWidth
										size="lg"
										style={styles.cta}
										>
										{strings.business.createFirstProduct}
									</Button>
								}
							/>
						) : null}

						{!isLoading &&
						!isError &&
						(totalCount ?? 0) > 0 &&
						filtered.length === 0 ? (
							<EmptyState
								title={strings.allOffers.noResultsTitle}
								message={strings.allOffers.noResultsBody}
							/>
						) : null}
					</View>
				}
			/>
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.md,
	},
	headerContainer: {
		gap: spacing.md,
		marginBottom: spacing.md,
	},
	separator: {
		height: spacing.md,
	},
	list: { flex: 1 },
	content: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.lg,
	},
	cta: {
		marginTop: spacing.xs,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: spacing.sm,
	},
	searchRow: {
		width: "100%",
	},
	searchBarFull: { width: "100%" },
	filterRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	searchBar: { flex: 1 },
	chipsRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	skeletonTitle: {
		height: 28,
		width: "40%",
		borderRadius: radii.sm,
	},
	skeletonPill: {
		width: 120,
		height: 36,
		borderRadius: radii.pill,
	},
	ctaSkeleton: {
		height: 44,
		borderRadius: radii.sm,
		marginTop: spacing.xs,
	},
	sectionTitleSkeleton: {
		height: 21,
		width: "45%",
		borderRadius: radii.sm,
	},
	sortSkeleton: {
		height: 36,
		width: "40%",
		borderRadius: radii.sm,
	},
	searchSkeleton: {
		// Match the 14px input's body line box, vertical padding and 1px borders.
		height: typography.bodyMedium.lineHeight + 2 * (spacing.sm + 2) + 2,
		width: "100%",
		borderRadius: radii.md,
	},
	filterSkeleton: {
		height: 36,
		width: 88,
		borderRadius: radii.sm,
	},
	listSkeleton: {
		gap: spacing.md,
	},
});