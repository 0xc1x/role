import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Search, ShoppingBag } from "lucide-react-native";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import {
	AppText,
	EmptyState,
	ErrorState,
	FilterChip,
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { useAuthStore } from "@/src/features/auth/store";
import {
	useBusinesses,
	useBusinessLocations,
	useBusinessOrders,
	useBusinessOrderStats,
} from "@/src/features/business/hooks";
import {
	type OrdersSort,
	type OrdersTab,
} from "@/src/features/business/domain/orders";
import {
	ACTIVE_ORDER_STATUSES,
	TERMINAL_ORDER_STATUSES,
	getWeekRange,
	orderStatusLabels,
	type HistoryPeriod,
} from "@/src/features/orders/domain/order";
import { HistoryDateFilter } from "@/src/features/orders/components/HistoryDateFilter";
import { NoBusinessPrompt } from "@/src/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/src/features/business/components/products/BranchSelector";
import { OrderStatsRow, OrderStatsRowSkeleton } from "@/src/features/business/components/orders/OrderStatsRow";
import { OrdersTabs } from "@/src/features/business/components/orders/OrdersTabs";
import { OrdersSortControl } from "@/src/features/business/components/orders/OrdersSortControl";
import { OrdersFiltersControl } from "@/src/features/business/components/orders/OrdersFiltersControl";
import { OrderCard, OrderCardSkeleton } from "@/src/features/business/components/orders/OrderCard";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";
import type { OrderDetail } from "@/src/features/orders/domain/order";

const SEARCH_DEBOUNCE_MS = 400;

/** Server-side date range for the history period (undefined = no range). */
function historyRange(
	period: HistoryPeriod,
	weekOffset: number,
	now: Date,
): { from?: string; to?: string } {
	if (period === "all") return {};
	if (period === "today") {
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const end = new Date(now);
		end.setHours(23, 59, 59, 999);
		return { from: start.toISOString(), to: end.toISOString() };
	}
	const { monday, sunday } = getWeekRange(now, weekOffset);
	return { from: monday.toISOString(), to: sunday.toISOString() };
}

export default function BusinessOrdersScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";

	const { data: locations, isLoading: locationsLoading } = useBusinessLocations(businessId);

	const [tab, setTab] = useState<OrdersTab>("active");
	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [status, setStatus] = useState<OrderStatusType | null>(null);
	const [sort, setSort] = useState<OrdersSort>("newest");
	const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
	const [weekOffset, setWeekOffset] = useState(0);

	// Debounce the search input (same precedent as all-offers).
	useEffect(() => {
		const t = setTimeout(
			() => setDebouncedSearch(searchQuery),
			SEARCH_DEBOUNCE_MS,
		);
		return () => clearTimeout(t);
	}, [searchQuery]);

	const historyDates = useMemo(
		() => historyRange(historyPeriod, weekOffset, new Date()),
		[historyPeriod, weekOffset],
	);
	const search =
		debouncedSearch.trim().length > 0 ? debouncedSearch.trim() : undefined;
	const isHistory = tab === "history";
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
	} = useBusinessOrders(businessId, {
		statuses: isHistory ? TERMINAL_ORDER_STATUSES : ACTIVE_ORDER_STATUSES,
		status: status ?? undefined,
		branchId,
		search,
		ascending: sort === "oldest",
		...(isHistory ? historyDates : {}),
	});
	const { data: stats, isLoading: statsLoading } =
		useBusinessOrderStats(businessId);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	useEffect(() => {
		setTab("active");
		setBranchId(null);
		setSearchQuery("");
		setDebouncedSearch("");
		setStatus(null);
		setSort("newest");
	}, [businessId]);

	const orders = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);

	// Empty page means "no orders at all" only without filters; with filters
	// it means "no match" (server already filtered, nothing left client-side).
	const hasActiveFilters =
		search != null ||
		status !== null ||
		branchId !== null ||
		(isHistory && historyPeriod !== "all");

	const renderItem = useCallback(
		({ item }: { item: OrderDetail }) => (
			<OrderCard businessId={businessId} item={item} />
		),
		[businessId],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderSeparator = useCallback(
		() => <View style={styles.separator} />,
		[],
	);

	if (!businessesLoading && !business) return <NoBusinessPrompt />;

	const loading = businessesLoading || isLoading;

	return (
		<Screen edges={["top", "left", "right"]}>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.ordersTitle}
				</AppText>
				{businessesLoading || locationsLoading ? (
					<Skeleton style={styles.branchSkeleton} />
				) : locations && locations.length > 0 ? (
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
				data={orders}
				keyExtractor={(item) => item.order.id}
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
						{loading || statsLoading || !stats ? (
							<OrderStatsRowSkeleton />
						) : (
							<OrderStatsRow stats={stats} />
						)}

						<OrdersTabs tab={tab} onChange={setTab} />

						{isHistory ? (
							<HistoryDateFilter
								period={historyPeriod}
								weekOffset={weekOffset}
								onPeriodChange={(p) => {
									setHistoryPeriod(p);
									if (p !== "week") setWeekOffset(0);
								}}
								onWeekChange={setWeekOffset}
							/>
						) : null}

						<View style={styles.searchRow}>
							<SearchBar
								value={searchQuery}
								onChangeText={setSearchQuery}
								placeholder={strings.business.ordersSearchHint}
								containerStyle={styles.searchBarFull}
							/>
						</View>
						<View style={styles.filterRow}>
							<OrdersFiltersControl status={status} onApply={setStatus} />
							<OrdersSortControl value={sort} onChange={setSort} />
						</View>

						{status ? (
							<View style={styles.chipsRow}>
								<FilterChip
									label={orderStatusLabels[status]}
									onClear={() => setStatus(null)}
								/>
							</View>
						) : null}

						{loading ? (
							<View style={styles.loadingList}>
								{[0, 1, 2].map((i) => (
									<OrderCardSkeleton key={`order-skeleton-${i}`} active={!isHistory} />
								))}
							</View>
						) : null}
						{isError ? (
							<ErrorState error={error} onRetry={() => void refetch()} />
						) : null}

						{!loading && !isError && orders.length === 0 && !hasActiveFilters ? (
							<EmptyState
								icon={
									<ShoppingBag
										size={28}
										color={colors.mutedForeground}
									/>
								}
								title={
									isHistory
										? strings.business.ordersNoHistoryTitle
										: strings.business.ordersNoActiveTitle
								}
								message={
									isHistory
										? strings.business.ordersNoHistoryBody
										: strings.business.ordersNoActiveBody
								}
							/>
						) : null}

						{!loading && !isError && orders.length === 0 && hasActiveFilters ? (
							<EmptyState
								icon={
									<Search
										size={28}
										color={colors.mutedForeground}
									/>
								}
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
	searchRow: {
		width: "100%",
	},
	searchBarFull: { width: "100%" },
	filterRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		justifyContent: "flex-end",
	},
	searchBar: { flex: 1 },
	chipsRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	branchSkeleton: {
		width: 140,
		height: 36,
		borderRadius: radii.pill,
	},
	loadingList: {
		gap: spacing.md,
	},
});