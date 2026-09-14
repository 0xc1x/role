import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
} from "react";
import {
	Animated,
	Easing,
	FlatList,
	Platform,
	Pressable,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrders } from "@/features/hooks";
import { OrderCard } from "@/features/orders/components/OrderCard";
import { HistoryDateFilter } from "@/features/orders/components/HistoryDateFilter";
import {
	filterByHistoryPeriod,
	isActiveStatus,
	isTerminalStatus,
	type HistoryPeriod,
} from "@/features/orders/domain/order";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { withAlpha } from "@/core/theme/alpha";

type OrdersTab = "active" | "past";

/** Entrada de la lista al cambiar de tab (eco del fadeUp del mock). */
const LIST_ENTER_DURATION = 280;

export default function OrdersScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } = useOrders();
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<OrdersTab>("active");
	const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
	const [weekOffset, setWeekOffset] = useState(0);
	const [showAllPast, setShowAllPast] = useState(false);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const normalized = query.trim().toLowerCase();
	const filtered = useMemo(() => {
		if (!data) return [];
		if (!normalized) return data;
		return data.filter((item) => {
			const haystack =
				`${item.businessName} ${item.offerTitle} ${item.order.order_number}`.toLowerCase();
			return haystack.includes(normalized);
		});
	}, [data, normalized]);

	const active = filtered.filter((item) => isActiveStatus(item.order.status));
	const past = filtered.filter((item) => isTerminalStatus(item.order.status));

	// Lo más accionable primero: listos para retirar antes que el resto.
	const activeSorted = useMemo(
		() =>
			[...active].sort(
				(a, b) =>
					Number(b.order.status === "ready_for_pickup") -
					Number(a.order.status === "ready_for_pickup"),
			),
		[active],
	);

	const pastVisible = useMemo(() => {
		if (!showAllPast) return past.slice(0, 5);
		return filterByHistoryPeriod(past, historyPeriod, weekOffset);
	}, [past, showAllPast, historyPeriod, weekOffset]);

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

	if (isLoading) {
		return (
			<Screen>
				<View style={styles.header}>
					<AppText variant="h2" weight="bold">
						{strings.orders.tabTitle}
					</AppText>
				</View>
				<View style={styles.list}>
					<Skeleton style={{ height: 48, borderRadius: radii.lg }} />
					{[0, 1, 2].map((i) => (
						<Skeleton
							key={`order-skeleton-${i}`}
							style={{ height: 148, borderRadius: radii.lg }}
						/>
					))}
				</View>
			</Screen>
		);
	}
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	const list = tab === "active" ? activeSorted : pastVisible;

	return (
		<Screen>
			{pull.indicator}
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
						activeCount={active.length}
						pastCount={past.length}
						onChange={(t) => {
							setTab(t);
							if (t !== "past") setShowAllPast(false);
						}}
					/>
				</View>

				{tab === "past" && showAllPast ? (
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
					refreshControl={
						<RefreshControl
							refreshing={isFetching}
							onRefresh={() => void refetch()}
							tintColor={colors.primary}
							colors={[colors.primary]}
						/>
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
					ListHeaderComponent={
						tab === "past" && past.length > 5 ? (
							<View style={styles.pastHeader}>
								<AppText
									variant="h3"
									weight="bold"
									numberOfLines={1}
									style={styles.pastHeaderTitle}
								>
									{strings.profile.pastOrders}
								</AppText>
								<Pressable
									onPress={() => setShowAllPast((v) => !v)}
									accessibilityRole="button"
									hitSlop={8}
									style={styles.pastHeaderAction}
								>
									<AppText
										variant="bodyMedium"
										weight="semiBold"
										style={{ color: colors.primary }}
									>
										{showAllPast
											? strings.home.seeLess
											: strings.profile.viewAllCount.replace(
													"{n}",
													String(past.length),
												)}
									</AppText>
								</Pressable>
							</View>
						) : null
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
	activeCount: number;
	pastCount: number;
	onChange: (tab: OrdersTab) => void;
}) {
	const { colors } = useTheme();
	const tabs: Array<{ key: OrdersTab; label: string }> = [
		{
			key: "active",
			label: strings.orders.tabActive.replace("{n}", String(activeCount)),
		},
		{
			key: "past",
			label: strings.orders.tabPast.replace("{n}", String(pastCount)),
		},
	];

	return (
		<View style={[styles.tabSeg, { backgroundColor: colors.muted }]}>
			{tabs.map((tab) => {
				const selected = active === tab.key;
				return (
					<Pressable
						key={tab.key}
						onPress={() => onChange(tab.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						style={[
							styles.tabSegBtn,
							selected && {
								backgroundColor: withAlpha(colors.primary, 0.14),
							},
						]}
					>
						<AppText
							variant="bodySmall"
							weight={selected ? "bold" : "semiBold"}
							style={{
								color: selected ? colors.primary : colors.mutedForeground,
							}}
						>
							{tab.label}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	stickyHeader: { borderBottomWidth: 1 },
	header: { padding: spacing.xl, paddingBottom: spacing.sm, gap: spacing.md },
	searchWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
	tabsWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
	tabSeg: {
		flexDirection: "row",
		borderRadius: radii.md,
		padding: spacing.xs,
		gap: spacing.xs,
	},
	tabSegBtn: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 9,
		borderRadius: radii.sm,
	},
	list: { padding: spacing.xl, gap: spacing.md },
	pastHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		paddingBottom: spacing.sm,
	},
	pastHeaderTitle: { flex: 1 },
	pastHeaderAction: { flexShrink: 0, paddingVertical: spacing.xs },
});
