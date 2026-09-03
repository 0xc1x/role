import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	SearchBar,
} from "@/core/ui";
import { useOrders } from "@/features/hooks";
import { OrderCard } from "@/features/orders/components/OrderCard";
import {
	isActiveStatus,
	isTerminalStatus,
} from "@/features/orders/domain/order";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

type OrdersTab = "active" | "past";

export default function OrdersScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } = useOrders();
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<OrdersTab>("active");
	const [historyPeriod, setHistoryPeriod] = useState<"today" | "week" | "all">("week");
	const [weekOffset, setWeekOffset] = useState(0);

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
		if (historyPeriod === "all") return past;
		const now = new Date();
		if (historyPeriod === "today") {
			const start = new Date(now);
			start.setHours(0, 0, 0, 0);
			const end = new Date(now);
			end.setHours(23, 59, 59, 999);
			return past.filter((item) => {
				const d = new Date(item.order.created_at);
				return d >= start && d <= end;
			});
		}
		// week: lunes a domingo de la semana con offset
		const base = new Date(now);
		base.setDate(base.getDate() + weekOffset * 7);
		const day = base.getDay() === 0 ? 7 : base.getDay();
		const monday = new Date(base);
		monday.setDate(base.getDate() - day + 1);
		monday.setHours(0, 0, 0, 0);
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		sunday.setHours(23, 59, 59, 999);
		return past.filter((item) => {
			const d = new Date(item.order.created_at);
			return d >= monday && d <= sunday;
		});
	}, [past, tab, historyPeriod, weekOffset]);

	if (isLoading) return <LoadingView />;
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	const list = tab === "active" ? active : historyList;

	return (
		<Screen>
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

function HistoryDateFilter({
	period,
	weekOffset,
	onPeriodChange,
	onWeekChange,
}: {
	period: "today" | "week" | "all";
	weekOffset: number;
	onPeriodChange: (p: "today" | "week" | "all") => void;
	onWeekChange: (o: number) => void;
}) {
	const { colors } = useTheme();
	const now = new Date();
	const base = new Date(now);
	base.setDate(base.getDate() + weekOffset * 7);
	const day = base.getDay() === 0 ? 7 : base.getDay();
	const monday = new Date(base);
	monday.setDate(base.getDate() - day + 1);
	const sunday = new Date(monday);
	sunday.setDate(monday.getDate() + 6);
	const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
	const weekLabel = weekOffset === 0 ? "Esta semana" : `${fmt(monday)} - ${fmt(sunday)}`;
	const isFutureWeek = weekOffset >= 0;

	return (
		<View style={historyStyles.wrap}>
			<View style={historyStyles.chipsRow}>
				{([
					{ k: "week" as const, l: "Semana" },
					{ k: "today" as const, l: "Hoy" },
					{ k: "all" as const, l: "Todo" },
				] as const).map((c) => {
					const sel = period === c.k;
					return (
						<Pressable
							key={c.k}
							onPress={() => onPeriodChange(c.k)}
							style={[historyStyles.chip, { borderColor: sel ? colors.primary : colors.borderSolid, backgroundColor: sel ? colors.primary : colors.card }]}
						>
							<AppText variant="bodySmall" weight={sel ? "bold" : "regular"} style={{ color: sel ? colors.primaryForeground : colors.mutedForeground }}>
								{c.l}
							</AppText>
						</Pressable>
					);
				})}
			</View>
			{period === "week" ? (
				<View style={historyStyles.weekRow}>
					<Pressable onPress={() => onWeekChange(weekOffset - 1)} hitSlop={8} style={historyStyles.weekBtn}>
						<Ionicons name="chevron-back" size={18} color={colors.foreground} />
					</Pressable>
					<AppText variant="bodySmall" weight="semiBold" style={{ color: colors.foreground }}>
						{weekLabel}
					</AppText>
					<Pressable
						onPress={() => !isFutureWeek && onWeekChange(weekOffset + 1)}
						hitSlop={8}
						style={[historyStyles.weekBtn, isFutureWeek && { opacity: 0.3 }]}
						disabled={isFutureWeek}
					>
						<Ionicons name="chevron-forward" size={18} color={colors.foreground} />
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

const historyStyles = StyleSheet.create({
	wrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm },
	chipsRow: { flexDirection: "row", gap: spacing.sm },
	chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
	weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
	weekBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});

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