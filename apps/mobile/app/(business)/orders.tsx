import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import {
	AppText,
	Button,
	EmptyState,
	ErrorState,
	FilterChip,
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import {
	useBusinesses,
	useBusinessLocations,
	useBusinessOrders,
} from "@/features/business/hooks";
import {
	filterAndSortOrders,
	orderStats,
	type OrdersSort,
	type OrdersTab,
} from "@/features/business/domain/orders";
import { orderStatusLabels, filterByHistoryPeriod, type HistoryPeriod } from "@/features/orders/domain/order";
import { HistoryDateFilter } from "@/features/orders/components/HistoryDateFilter";
import { NoBusinessPrompt } from "@/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/features/business/components/products/BranchSelector";
import { OrderStatsRow, OrderStatsRowSkeleton } from "@/features/business/components/orders/OrderStatsRow";
import { OrdersTabs } from "@/features/business/components/orders/OrdersTabs";
import { OrdersSortControl } from "@/features/business/components/orders/OrdersSortControl";
import { OrdersFiltersControl } from "@/features/business/components/orders/OrdersFiltersControl";
import { OrderCard, OrderCardSkeleton } from "@/features/business/components/orders/OrderCard";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";

export default function BusinessOrdersScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";

	const { data: locations, isLoading: locationsLoading } = useBusinessLocations(businessId);
	const {
		data: orders,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useBusinessOrders(businessId);

	const [tab, setTab] = useState<OrdersTab>("active");
	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [status, setStatus] = useState<OrderStatusType | null>(null);
	const [sort, setSort] = useState<OrdersSort>("newest");
	const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
	const [weekOffset, setWeekOffset] = useState(0);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	useEffect(() => {
		setTab("active");
		setBranchId(null);
		setSearchQuery("");
		setStatus(null);
		setSort("newest");
	}, [businessId]);

	const filtered = useMemo(() => {
		const baseFiltered = filterAndSortOrders(orders ?? [], {
			tab,
			branchId,
			status,
			searchQuery,
			sort,
		});
		if (tab !== "history" || historyPeriod === "all") return baseFiltered;
		return filterByHistoryPeriod(baseFiltered, historyPeriod, weekOffset);
	}, [orders, tab, branchId, status, searchQuery, sort, historyPeriod, weekOffset]);

	const renderItem = useCallback(
		({ item }: { item: (typeof filtered)[number] }) => (
			<OrderCard businessId={businessId} item={item} />
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
		return <BusinessOrdersSkeleton />;
	}

	const stats = orderStats(orders ?? []);

	const isHistory = tab === "history";

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.ordersTitle}
				</AppText>
				{locationsLoading ? (
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
				data={filtered}
				keyExtractor={(item) => item.order.id}
				renderItem={renderItem}
				ItemSeparatorComponent={renderSeparator}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						{isLoading ? (
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

						{isLoading ? (
							<View style={styles.loadingList}>
								{[0, 1, 2].map((i) => (
									<OrderCardSkeleton key={`order-skeleton-${i}`} />
								))}
							</View>
						) : null}
						{isError ? (
							<ErrorState error={error} onRetry={() => void refetch()} />
						) : null}

						{!isLoading && !isError && orders && orders.length === 0 ? (
							<EmptyState
								icon={
									<Ionicons
										name="bag-handle-outline"
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

						{!isLoading &&
						!isError &&
						orders &&
						orders.length > 0 &&
						filtered.length === 0 ? (
							<EmptyState
								icon={
									<Ionicons
										name="search-outline"
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

/**
 * Skeleton con las dimensiones aproximadas de la pantalla de pedidos
 * (header + stats + tabs + búsqueda + lista de OrderCards).
 * Mismo patrón que GestionContentSkeleton / ExploreCategoryGrid.
 */
function BusinessOrdersSkeleton() {
	return (
		<Screen>
			<View style={styles.header}>
				<Skeleton style={styles.skeletonTitle} />
				<Skeleton style={styles.branchSkeleton} />
			</View>
			<View style={styles.content}>
				<OrderStatsRowSkeleton />
				<Skeleton style={styles.skeletonTabs} />
				<Skeleton style={styles.skeletonSearch} />
				<View style={styles.loadingList}>
					{[0, 1, 2].map((i) => (
						<OrderCardSkeleton key={`business-orders-skeleton-${i}`} />
					))}
				</View>
			</View>
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
	content: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
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
	skeletonTitle: {
		height: 28,
		width: "40%",
		borderRadius: radii.sm,
	},
	skeletonTabs: {
		height: 40,
		width: "100%",
		borderRadius: radii.pill,
	},
	skeletonSearch: {
		height: 48,
		width: "100%",
		borderRadius: radii.lg,
	},
});