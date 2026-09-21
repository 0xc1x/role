import { useMemo, useState } from "react";
import { Calendar, ChartColumn, ChevronLeft, ChevronRight, Clock, Package, ShoppingBag, Star, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react-native";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/src/features/auth/store";
import { useBusinesses, useBusinessStats } from "@/src/features/business/hooks";
import {
	statsDaysInRange,
	statsRangeFor,
	statsRangeLabel,
	statsViewModel,
	type StatsPeriod,
} from "@/src/features/business/domain/stats";
import { formatMoney, formatPercent } from "@/src/core/utils/formatters";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import type { BusinessStats } from "@/src/features/business/domain/business";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export default function BusinessStatsScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];
	const [period, setPeriod] = useState<StatsPeriod>("week");
	const [offset, setOffset] = useState(0);
	const { range, days } = useMemo(() => {
		const r = statsRangeFor(period, offset);
		return {
			range: { start: r.start.toISOString(), end: r.end.toISOString() },
			days: statsDaysInRange(r),
		};
	}, [period, offset]);
	const {
		data: stats,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessStats(business?.id ?? "", range.start, range.end);

	if (isLoading) {
		return (
			<Screen scroll>
				<View style={styles.container}>
				<ScreenHeader
					title={strings.business.statistics}
					fallback="/(business)/management"
				/>
				<Skeleton style={styles.skeletonSubtitle} />
				<View style={styles.skeletonPeriodRow}>
					{[0, 1, 2].map((i) => (
						<Skeleton key={`stats-period-skeleton-${i}`} style={styles.skeletonPeriodChip} />
					))}
				</View>
				<View style={styles.kpiGrid}>
						{[0, 1, 2, 3].map((i) => (
							<Skeleton key={`stats-kpi-skeleton-${i}`} style={styles.skeletonKpi} />
						))}
					</View>
					<Skeleton style={styles.skeletonChart} />
					<Skeleton style={styles.skeletonChart} />
				</View>
			</Screen>
		);
	}
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!business)
		return (
			<Screen scroll>
				<View style={styles.container}>
					<ScreenHeader
						title={strings.business.statistics}
						fallback="/(business)/management"
					/>
					<EmptyState
						title={strings.business.noBusiness}
						action={
							<Button
								onPress={() => router.push("/my-business/business-new")}
							>
								{strings.business.createBusiness}
							</Button>
						}
					/>
				</View>
			</Screen>
		);
	if (!stats)
		return (
			<Screen scroll>
				<View style={styles.container}>
					<ScreenHeader
						title={strings.business.statistics}
						fallback="/(business)/management"
					/>
					<EmptyState
						title={strings.business.noSalesInPeriod}
						message={strings.business.noSalesProducts}
						action={
							<Button
								variant="outline"
								onPress={() => void refetch()}
							>
								{strings.common.retry}
							</Button>
						}
					/>
				</View>
			</Screen>
		);

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.statistics}
					fallback="/(business)/management"
				/>
				<AppText
					variant="bodySmall"
					style={{
						color: colors.mutedForeground,
						marginTop: spacing.lg,
						marginBottom: spacing.sm,
					}}
				>
					{strings.business.statsSubtitle}
				</AppText>

				<PeriodSelector
					period={period}
					offset={offset}
					onPeriodChange={(p) => {
						setPeriod(p);
						setOffset(0);
					}}
					onOffsetChange={setOffset}
				/>

				<View style={styles.kpiGrid}>
					<View style={styles.kpiRow}>
						<KpiCard
							label={strings.business.revenue}
							value={formatMoney(stats.revenue)}
							change={stats.revenueChange}
							icon={Wallet}
							colorKey="success"
						/>
						<KpiCard
							label={strings.business.ordersCount}
							value={String(stats.ordersCount)}
							change={stats.ordersChange}
							icon={ShoppingBag}
							colorKey="primary"
						/>
					</View>
					<View style={styles.kpiRow}>
						<KpiCard
							label={strings.business.kpiRescued}
							value={String(stats.rescuedCount)}
							change={stats.rescuedChange}
							icon={Package}
							colorKey="warning"
						/>
						<KpiCard
							label={strings.business.avgRating}
							value={stats.avgRating.toFixed(1)}
							change={null}
							icon={Star}
							colorKey="info"
							onPress={() =>
								router.push(`/business/${business?.id}/reviews`)
							}
						/>
					</View>
				</View>

				<DailyRevenueChart dailyStats={stats.dailyStats} />

				<TopProducts products={stats.topProducts} />

					<PeriodSummary stats={stats} days={days} />
			</View>
		</Screen>
	);
}

// ─── Selector de período ─────────────────────────────────────────────

const PERIOD_OPTIONS: Array<{ key: StatsPeriod; label: string }> = [
	{ key: "week", label: strings.business.statsWeek },
	{ key: "month", label: strings.business.statsMonth },
	{ key: "year", label: strings.business.statsYear },
];

function PeriodSelector({
	period,
	offset,
	onPeriodChange,
	onOffsetChange,
}: {
	period: StatsPeriod;
	offset: number;
	onPeriodChange: (p: StatsPeriod) => void;
	onOffsetChange: (o: number) => void;
}) {
	const { colors } = useTheme();
	const options = PERIOD_OPTIONS;
	const isCurrent = offset >= 0;

	return (
		<View>
			<View style={styles.periodRow}>
				{options.map((option) => {
					const active = period === option.key;
					return (
						<Pressable
							key={option.key}
							onPress={() => onPeriodChange(option.key)}
							accessibilityRole="button"
							style={[
								styles.periodChip,
								{
									backgroundColor: active ? colors.primary : "transparent",
									borderColor: active ? colors.primary : colors.borderSolid,
								},
							]}
						>
							<AppText
								variant="labelSmall"
								weight={active ? "bold" : "medium"}
								style={{
									color: active ? colors.primaryForeground : colors.foreground,
								}}
							>
								{option.label}
							</AppText>
						</Pressable>
					);
				})}
			</View>
			<View style={[styles.rangeRow, { marginTop: spacing.sm }]}>
				<Button
					variant="ghost"
					size="icon"
					onPress={() => onOffsetChange(offset - 1)}
					hitSlop={8}
					accessibilityRole="button"
					aria-label={strings.business.statsPreviousPeriod}
					style={styles.navBtn}
					icon={<ChevronLeft size={22} color={colors.foreground} />}
				/>
				<View style={styles.rangeLabel}>
					<Clock
						size={14}
						color={colors.mutedForeground}
					/>
					<AppText
						variant="bodySmall"
						weight="medium"
						numberOfLines={1}
						style={{ color: colors.mutedForeground }}
					>
						{statsRangeLabel(period, offset, {
							thisWeek: strings.business.statsThisWeek,
							thisMonth: strings.business.statsThisMonth,
							thisYear: strings.business.statsThisYear,
						})}
					</AppText>
				</View>
				<Button
					variant="ghost"
					size="icon"
					onPress={() => onOffsetChange(offset + 1)}
					disabled={isCurrent}
					hitSlop={8}
					accessibilityRole="button"
					aria-label={strings.business.statsNextPeriod}
					style={[styles.navBtn, isCurrent && { opacity: 0.3 }]}
					icon={<ChevronRight size={18} color={colors.foreground} />}
				/>
			</View>
		</View>
	);
}

// ─── KPIs ────────────────────────────────────────────────────────────

function kpiColor(colors: ReturnType<typeof useTheme>["colors"], key: string) {
	switch (key) {
		case "success":
			return colors.success;
		case "warning":
			return colors.warning;
		case "info":
			return colors.info;
		default:
			return colors.primary;
	}
}

function KpiCard({
	label,
	value,
	change,
	icon: Icon,
	colorKey,
	onPress,
}: {
	label: string;
	value: string;
	change: number | null;
	icon: LucideIcon;
	colorKey: "success" | "primary" | "warning" | "info";
	onPress?: () => void;
}) {
	const { colors } = useTheme();
	const color = kpiColor(colors, colorKey);
	const positive = change != null && change >= 0;
	const trendColor =
		change == null ? colors.mutedForeground : positive ? colors.success : colors.destructive;

	const body = (pressed = false) => (
		<Card style={[styles.kpiFill, pressed && { opacity: 0.9 }]}>
			<CardHeader style={styles.kpiHeader}>
				<View style={[styles.kpiIcon, { backgroundColor: withAlpha(color, 0.15) }]}>
					<Icon size={16} color={color} />
				</View>
				<AppText variant="bodySmall" numberOfLines={1} style={styles.flex1}>
					{label}
				</AppText>
			</CardHeader>
			<CardContent>
				<AppText variant="h3" weight="bold" style={{ color }} numberOfLines={1}>
					{value}
				</AppText>
			</CardContent>
			
			{change != null ? (
				<CardContent style={styles.trendRow}>
					{positive ? (
						<TrendingUp size={13} color={trendColor} />
					) : (
						<TrendingDown size={13} color={trendColor} />
					)}
					<AppText
						variant="bodySmall"
						weight="bold"
						style={{ color: trendColor }}
					>
						{positive ? "+" : ""}
						{formatPercent(Math.abs(change))}
					</AppText>
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.vsPrevious}
					</AppText>
				</CardContent>
			) : null}
		</Card>
	);

	return (
		<View style={styles.kpiColumn}>
			{onPress ? (
				<Pressable
					onPress={onPress}
					accessibilityRole="button"
					style={styles.kpiFill}
				>
					{({ pressed }) => body(pressed)}
				</Pressable>
			) : body()}
		</View>
	);
}

// ─── Gráfico de ventas diarias ───────────────────────────────────────

function DailyRevenueChart({ dailyStats }: { dailyStats: BusinessStats["dailyStats"] }) {
	const { colors } = useTheme();
	const maxRevenue = Math.max(...dailyStats.map((d) => d.revenue), 0);

	return (
		<Card style={styles.cardGap}>
			<CardHeader style={styles.cardHeader}>
				<Calendar size={18} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{strings.business.dailyChart}
				</AppText>
			</CardHeader>
			{dailyStats.length === 0 || maxRevenue === 0 ? (
				<View style={styles.emptyState}>
					<ChartColumn
						size={36}
						color={colors.mutedForeground}
					/>
					<AppText
						variant="bodySmall"
						style={{
							color: colors.mutedForeground,
							textAlign: "center",
						}}
					>
						{strings.business.noSalesInPeriod}
					</AppText>
				</View>
			) : (
				dailyStats.map((stat) => (
					<CardContent key={stat.day} style={styles.chartRow}>
						<View style={styles.rowBetween}>
							<AppText variant="bodyMedium" weight="bold">
								{stat.day}
							</AppText>
							<View style={styles.chartValues}>
								<AppText
									variant="bodyMedium"
									weight="bold"
									style={{ color: colors.success }}
								>
									{formatMoney(stat.revenue)}
								</AppText>
								<AppText
									variant="bodySmall"
									style={{ color: colors.mutedForeground }}
								>
									({stat.orders})
								</AppText>
							</View>
						</View>
						<View
							style={[styles.chartTrack, { backgroundColor: colors.surfaceMuted }]}
						>
							<View
								style={[
									styles.chartBar,
									{
										backgroundColor: colors.primary,
										width: `${Math.max((stat.revenue / maxRevenue) * 100, stat.revenue > 0 ? 4 : 0)}%`,
									},
								]}
							/>
						</View>
					</CardContent>
				))
			)}
		</Card>
	);
}

// ─── Productos más vendidos ──────────────────────────────────────────

function TopProducts({ products }: { products: BusinessStats["topProducts"] }) {
	const { colors } = useTheme();

	return (
		<Card style={styles.cardGap}>
			<CardHeader>
				<AppText variant="h4" weight="bold">
					{strings.business.topProducts}
				</AppText>
			</CardHeader>
			
			{products.length === 0 ? (
				<View style={styles.emptyState}>
					<Package
						size={32}
						color={colors.mutedForeground}
					/>
					<AppText
						variant="bodySmall"
						style={{
							color: colors.mutedForeground,
							textAlign: "center",
						}}
					>
						{strings.business.noSalesProducts}
					</AppText>
				</View>
			) : (
				products.map((product, index) => (
					<CardContent key={product.name} style={styles.productRow}>
						<View
							style={[styles.rankCircle, { backgroundColor: withAlpha(colors.primary, 0.102) }]}
						>
							<AppText
								variant="bodySmall"
								weight="bold"
								style={{ color: colors.primary }}
							>
								{index + 1}
							</AppText>
						</View>
						<View style={styles.flex1}>
							<AppText variant="bodyMedium" weight="bold" numberOfLines={1}>
								{product.name}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{product.sold} {strings.business.unitsSold}
							</AppText>
						</View>
						<AppText
							variant="bodyMedium"
							weight="bold"
							style={{ color: colors.success }}
						>
							{formatMoney(product.revenue)}
						</AppText>
					</CardContent>
				))
			)}
		</Card>
	);
}

// ─── Resumen del período ─────────────────────────────────────────────

function PeriodSummary({
	stats,
	days,
}: {
	stats: BusinessStats;
	days: number;
}) {
	const { colors } = useTheme();
	const vm = statsViewModel(stats);
	const dailyAvg = vm.dailyAvg(days);
	const ticketAvg = vm.avgTicket;

	return (
		<View style={[styles.summary, { backgroundColor: colors.primary, boxShadow: `0px 4px 12px ${withAlpha(colors.primary, 0.302)}` }]}>
			<AppText
				variant="bodyMedium"
				weight="semiBold"
				style={{ color: colors.primaryForeground }}
			>
				{strings.business.statsSummary}
			</AppText>
			<AppText
				variant="bodySmall"
				style={{ color: withAlpha(colors.primaryForeground, 0.902), marginTop: spacing.sm }}
			>
				{`${(stats.revenueChange >= 0
					? strings.business.statsGrowthUp
					: strings.business.statsGrowthDown
				).replace("{pct}", Math.abs(stats.revenueChange).toFixed(1))} ${strings.business.statsRescued.replace("{count}", String(stats.rescuedCount))}`}
			</AppText>
			<View style={styles.summaryRow}>
				<View style={styles.flex1}>
					<AppText
						variant="bodySmall"
						style={{ color: withAlpha(colors.primaryForeground, 0.749) }}
					>
						{strings.business.dailyAvg}
					</AppText>
					<AppText variant="h2" weight="bold" style={{ color: colors.primaryForeground }}>
						{formatMoney(dailyAvg)}
					</AppText>
				</View>
				<View style={styles.flex1}>
					<AppText
						variant="bodySmall"
						style={{ color: withAlpha(colors.primaryForeground, 0.749) }}
					>
						{strings.business.avgTicket}
					</AppText>
					<AppText variant="h2" weight="bold" style={{ color: colors.primaryForeground }}>
						{formatMoney(ticketAvg)}
					</AppText>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	periodRow: { flexDirection: "row", gap: spacing.sm },
	periodChip: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
	},
	rangeRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	rangeLabel: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	navBtn: {
		width: 32,
		height: 32,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	kpiGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.md,
		marginTop: spacing.lg,
	},
	kpiRow: { width: "100%", flexDirection: "row", gap: spacing.md },
	kpiColumn: { flex: 1, minWidth: 0 },
	kpiFill: { flexGrow: 1, width: "100%" },
	kpiHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	kpiIcon: {
		width: 30,
		height: 30,
		borderRadius: radii.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	trendRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	cardGap: { marginTop: spacing.lg },
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.md,
	},
	emptyState: {
		alignItems: "center",
		gap: spacing.sm,
		paddingVertical: spacing.xl,
	},
	chartRow: { marginBottom: spacing.md },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	chartValues: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	chartTrack: {
		height: 8,
		borderRadius: radii.sm,
		marginTop: spacing.xs,
		overflow: "hidden",
	},
	chartBar: { height: "100%", borderRadius: radii.sm },
	productRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	rankCircle: {
		width: 28,
		height: 28,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	summary: {
		marginTop: spacing.lg,
		padding: spacing.lg,
		borderRadius: radii.lg,
	},
	summaryRow: {
		flexDirection: "row",
		gap: spacing.lg,
		marginTop: spacing.md,
	},
	flex1: { flex: 1 },
	skeletonKpi: {
		flexBasis: "47%",
		flexGrow: 1,
		flexShrink: 1,
		height: 110,
		borderRadius: radii.lg,
	},
	skeletonSubtitle: {
		height: 16,
		width: "70%",
		borderRadius: radii.sm,
		marginTop: spacing.lg,
	},
	skeletonPeriodRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	skeletonPeriodChip: {
		flex: 1,
		height: 38,
		borderRadius: radii.pill,
	},
	skeletonChart: { height: 180, borderRadius: radii.lg, marginTop: spacing.lg },
});
