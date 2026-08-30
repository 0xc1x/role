import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	EmptyState,
	ErrorState,
	FilterChip,
	LoadingView,
	Screen,
	SearchBar,
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
import { orderStatusLabels } from "@/features/orders/domain/order";
import { NoBusinessPrompt } from "@/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/features/business/components/products/BranchSelector";
import { OrderStatsRow } from "@/features/business/components/orders/OrderStatsRow";
import { OrdersTabs } from "@/features/business/components/orders/OrdersTabs";
import { OrdersSortControl } from "@/features/business/components/orders/OrdersSortControl";
import { OrdersFiltersControl } from "@/features/business/components/orders/OrdersFiltersControl";
import { OrderCard } from "@/features/business/components/orders/OrderCard";
import { spacing } from "@/core/theme/spacing";
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

	const { data: locations } = useBusinessLocations(businessId);
	const {
		data: orders,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessOrders(businessId);

	const [tab, setTab] = useState<OrdersTab>("active");
	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [status, setStatus] = useState<OrderStatusType | null>(null);
	const [sort, setSort] = useState<OrdersSort>("newest");
	const [historyPeriod, setHistoryPeriod] = useState<"today" | "week" | "all">("week");
	const [weekOffset, setWeekOffset] = useState(0);

	useEffect(() => {
		setTab("active");
		setBranchId(null);
		setSearchQuery("");
		setStatus(null);
		setSort("newest");
	}, [businessId]);

	if (businessesLoading || !business) {
		if (!businessesLoading && !business) {
			return <NoBusinessPrompt />;
		}
		return <LoadingView />;
	}

	const stats = orderStats(orders ?? []);
	const baseFiltered = filterAndSortOrders(orders ?? [], {
		tab,
		branchId,
		status,
		searchQuery,
		sort,
	});
	const filtered = useMemo(() => {
		if (tab !== "history" || historyPeriod === "all") return baseFiltered;
		const now = new Date();
		if (historyPeriod === "today") {
			const start = new Date(now); start.setHours(0,0,0,0);
			const end = new Date(now); end.setHours(23,59,59,999);
			return baseFiltered.filter((i) => {
				const d = new Date(i.order.created_at);
				return d >= start && d <= end;
			});
		}
		const base = new Date(now); base.setDate(base.getDate() + weekOffset * 7);
		const day = base.getDay() === 0 ? 7 : base.getDay();
		const monday = new Date(base); monday.setDate(base.getDate() - day + 1); monday.setHours(0,0,0,0);
		const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
		return baseFiltered.filter((i) => {
			const d = new Date(i.order.created_at);
			return d >= monday && d <= sunday;
		});
	}, [baseFiltered, tab, historyPeriod, weekOffset]);

	const isHistory = tab === "history";

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.ordersTitle}
				</AppText>
				{locations && locations.length > 0 ? (
					<BranchSelector
						locations={locations}
						selectedId={branchId}
						onSelect={setBranchId}
					/>
				) : null}
			</View>

			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.content}
			>
				<OrderStatsRow stats={stats} />

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

				{isLoading ? <LoadingView /> : null}
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

				{filtered.map((item) => (
					<OrderCard key={item.order.id} businessId={businessId} item={item} />
				))}
			</ScrollView>
		</Screen>
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
						<Pressable key={c.k} onPress={() => onPeriodChange(c.k)} style={[historyStyles.chip, { borderColor: sel ? colors.primary : colors.borderSolid, backgroundColor: sel ? colors.primary : colors.card }]}>
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
					<AppText variant="bodySmall" weight="semiBold" style={{ color: colors.foreground }}>{weekLabel}</AppText>
					<Pressable onPress={() => !isFutureWeek && onWeekChange(weekOffset + 1)} hitSlop={8} style={[historyStyles.weekBtn, isFutureWeek && { opacity: 0.3 }]} disabled={isFutureWeek}>
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
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.md,
	},
	content: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
		gap: spacing.md,
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
});