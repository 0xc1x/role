import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
} from "react";
import {
	ActivityIndicator,
	Animated,
	Easing,
	FlatList,
	Platform,
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
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { useOrderCounts, useOrders } from "@/src/features/hooks";
import { OrderCard, OrderCardSkeleton } from "@/src/features/orders/components/OrderCard";
import { HistoryDateFilter } from "@/src/features/orders/components/HistoryDateFilter";
import {
	ACTIVE_ORDER_STATUSES,
	TERMINAL_ORDER_STATUSES,
	getWeekRange,
	type HistoryPeriod,
} from "@/src/features/orders/domain/order";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { SegmentedTabs } from "@/src/core/ui/SegmentedTabs";

type OrdersTab = "active" | "past";

/** Entrada de la lista al cambiar de tab (eco del fadeUp del mock). */
const LIST_ENTER_DURATION = 280;

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

export default function OrdersScreen() {
	const { colors } = useTheme();
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [tab, setTab] = useState<OrdersTab>("active");
	const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
	const [weekOffset, setWeekOffset] = useState(0);

	// Debounce the search input (same precedent as all-offers).
	useEffect(() => {
		const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [query]);

	const pastRange = useMemo(
		() => historyRange(historyPeriod, weekOffset, new Date()),
		[historyPeriod, weekOffset],
	);
	const search = debouncedQuery.trim().length > 0 ? debouncedQuery.trim() : undefined;
	const listFilters =
		tab === "active"
			? { statuses: ACTIVE_ORDER_STATUSES, search }
			: { statuses: TERMINAL_ORDER_STATUSES, search, ...pastRange };
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
	} = useOrders(listFilters);
	const {
		data: counts,
		isLoading: countsLoading,
		isError: countsError,
	} = useOrderCounts({
		search,
		pastFrom: pastRange.from,
		pastTo: pastRange.to,
	});
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const items = useMemo(() => infiniteData?.pages.flat() ?? [], [infiniteData]);

	// Lo más accionable primero: listos para retirar antes que el resto
	// (presentational order over the loaded page; server sorts by date).
	const list = useMemo(
		() =>
			tab === "active"
				? [...items].sort(
						(a, b) =>
							Number(b.order.status === "ready_for_pickup") -
							Number(a.order.status === "ready_for_pickup"),
					)
				: items,
		[items, tab],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const [enterAnim] = useState(() => new Animated.Value(0));
	useEffect(() => {
		enterAnim.setValue(0);
		Animated.timing(enterAnim, {
			toValue: 1,
			duration: LIST_ENTER_DURATION,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: Platform.OS !== "web",
		}).start();
	}, [tab, enterAnim]);

	const renderItem = useCallback(
		({ item }: { item: ComponentProps<typeof OrderCard>["item"] }) => (
			<OrderRow item={item} />
		),
		[],
	);

	if (!isLoading && isError) return <ErrorState error={error} onRetry={refetch} />;

	const header = (
			<View
				style={[
					styles.stickyHeader,
					{
						backgroundColor: colors.background,
						borderColor: colors.border,
					},
				]}
			>
				<View style={styles.header}>
					<AppText variant="h2" weight="bold">
						{strings.orders.tabTitle}
					</AppText>
				</View>

				<View style={styles.searchWrap}>
					<SearchBar
						value={query}
						onChangeText={setQuery}
						placeholder={strings.orders.searchHint}
					/>
				</View>

				<View style={styles.tabsWrap}>
					<OrdersTabs
						active={tab}
						// Counts stay hidden while loading or on error (a failed
						// head-count must not render stale/undefined badges).
						activeCount={
							countsLoading || countsError ? undefined : counts?.activeCount
						}
						pastCount={
							countsLoading || countsError ? undefined : counts?.pastCount
						}
						onChange={setTab}
					/>
				</View>

				{tab === "past" ? (
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
			</View>
	);

	if (isLoading) {
		return (
			<Screen>
				<ScrollView>
					{header}
					<View style={styles.list}>
						{[0, 1, 2].map((index) => (
							<OrderCardSkeleton key={index} active={tab === "active"} />
						))}
					</View>
				</ScrollView>
			</Screen>
		);
	}

	return (
		<Screen>
			{pull.indicator}
			{header}
			<Animated.View
				key={tab}
				style={{
					flex: 1,
					opacity: enterAnim,
					transform: [
						{
							translateY: enterAnim.interpolate({
								inputRange: [0, 1],
								outputRange: [6, 0],
							}),
						},
					],
				}}
			>
				<FlatList
					ref={pull.ref}
					data={list}
					keyExtractor={(item) => item.order.id}
					contentContainerStyle={styles.list}
					keyboardShouldPersistTaps="handled"
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
					ListEmptyComponent={
						<EmptyState
							title={
								tab === "active"
									? strings.orders.emptyActive
									: strings.orders.emptyPast
							}
							message={strings.orders.emptySearchHint}
						/>
					}
					renderItem={renderItem}
				/>
			</Animated.View>
		</Screen>
	);
}

const OrderRow = memo(function OrderRow({
	item,
}: {
	item: ComponentProps<typeof OrderCard>["item"];
}) {
	return <OrderCard item={item} />;
});

// ─── Tabs (segmented control del mock, con conteos) ────────────────

function OrdersTabs({
	active,
	activeCount,
	pastCount,
	onChange,
}: {
	active: OrdersTab;
	activeCount?: number;
	pastCount?: number;
	onChange: (tab: OrdersTab) => void;
}) {
	const tabs: Array<{ key: OrdersTab; label: string }> = [
		{
			key: "active",
			label: activeCount === undefined
				? strings.orders.tabActive.replace(" ({n})", "")
				: strings.orders.tabActive.replace("{n}", String(activeCount)),
		},
		{
			key: "past",
			label: pastCount === undefined
				? strings.orders.tabPast.replace(" ({n})", "")
				: strings.orders.tabPast.replace("{n}", String(pastCount)),
		},
	];

	return <SegmentedTabs value={active} items={tabs} onValueChange={onChange} />;
}

const styles = StyleSheet.create({
	stickyHeader: { borderBottomWidth: 1 },
	header: { padding: spacing.xl, paddingBottom: spacing.sm, gap: spacing.md },
	searchWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
	tabsWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
	list: { padding: spacing.xl, gap: spacing.md },
});
