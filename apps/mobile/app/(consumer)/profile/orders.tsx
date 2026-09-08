import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	SearchBar,
	useWebPullToRefresh,
} from "@/core/ui";
import { useOrders } from "@/features/hooks";
import { OrderCard } from "@/features/orders/components/OrderCard";
import { HistoryDateFilter } from "@/features/orders/components/HistoryDateFilter";
import {
	filterByHistoryPeriod,
	isActiveStatus,
	isTerminalStatus,
	type HistoryPeriod,
} from "@/features/orders/domain/order";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

type OrdersTab = "active" | "past";

export default function OrdersScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } = useOrders();
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<OrdersTab>("active");
	const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
	const [weekOffset, setWeekOffset] = useState(0);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const normalized = query.trim().toLowerCase();
	const filtered = useMemo(() => {
		if (!data) return [];
		if (!normalized) return data;
		return data.filter((item) => {
			const haystack = `${item.businessName} ${item.offerTitle} ${item.order.order_number}`.toLowerCase();
			return haystack.includes(normalized);
		});
	}, [data, normalized]);

	const active = filtered.filter((item) => isActiveStatus(item.order.status));
	const past = filtered.filter((item) => isTerminalStatus(item.order.status));

	const historyList = useMemo(() => {
		if (tab !== "past") return past;
		return filterByHistoryPeriod(past, historyPeriod, weekOffset);
	}, [past, tab, historyPeriod, weekOffset]);

	if (isLoading) return <LoadingView />;
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	const list = tab === "active" ? active : historyList;

	return (
		<Screen>
			{pull.indicator}
			<View style={styles.header}>
				<ScreenHeader title={strings.orders.title} fallback="/(consumer)/profile" />
			</View>

			<View style={styles.searchWrap}>
				<SearchBar
					value={query}
					onChangeText={setQuery}
					placeholder={strings.orders.searchHint}
				/>
			</View>

			<OrdersTabs
				active={tab}
				activeCount={active.length}
				pastCount={past.length}
				onChange={setTab}
			/>

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
				renderItem={({ item }) => <OrderCard item={item} />}
			/>
		</Screen>
	);
}

// ─── Tabs ────────────────────────────────────────────────────────────

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
		<View style={styles.tabBar}>
			{tabs.map((tab) => {
				const selected = active === tab.key;
				return (
					<Pressable
						key={tab.key}
						onPress={() => onChange(tab.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						style={[
							styles.tab,
							selected && { borderBottomColor: colors.primary },
						]}
					>
						<AppText
							variant="bodyMedium"
							weight={selected ? "bold" : "regular"}
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
	header: { padding: spacing.xl , gap: spacing.md},
	searchWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
	tabBar: { flexDirection: "row" },
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.md,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	list: { padding: spacing.xl, gap: spacing.md },
});