import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useBusinesses, useBusinessStats } from "@/features/business/hooks";
import {
	statsDaysInRange,
	statsRangeFor,
	type StatsPeriod,
} from "@/features/business/domain/stats";
import { formatMoney, formatPercent } from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { BusinessStats } from "@/features/business/domain/business";

const MONTH_ABBR = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

function rangeLabel(period: StatsPeriod, offset: number): string {
	if (offset === 0) {
		if (period === "week") return strings.business.statsThisWeek;
		if (period === "month") return strings.business.statsThisMonth;
		return strings.business.statsThisYear;
	}
	const { start, end } = statsRangeFor(period, offset);
	if (period === "year") return String(end.getFullYear());
	if (period === "month")
		return `${MONTH_ABBR[start.getMonth()]} ${start.getFullYear()}`;
	const sameYear = start.getFullYear() === end.getFullYear();
	const day = (d: Date) =>
		`${d.getDate()} ${MONTH_ABBR[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
	return `${day(start)} – ${day(end)} ${end.getFullYear()}`;
}

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

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!stats || !business) return null;

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
					<KpiCard
						label={strings.business.revenue}
						value={formatMoney(stats.revenue)}
						change={stats.revenueChange}
						icon="wallet-outline"
						colorKey="success"
					/>
					<KpiCard
						label={strings.business.ordersCount}
						value={String(stats.ordersCount)}
						change={stats.ordersChange}
						icon="bag-handle-outline"
						colorKey="primary"
					/>
					<KpiCard
						label={strings.business.kpiRescued}
						value={String(stats.rescuedCount)}
						change={stats.rescuedChange}
						icon="cube-outline"
						colorKey="warning"
					/>
					<KpiCard
						label={strings.business.avgRating}
						value={stats.avgRating.toFixed(1)}
						change={null}
						icon="star-outline"
						colorKey="info"
					/>
				</View>

				<DailyRevenueChart dailyStats={stats.dailyStats} />

				<TopProducts products={stats.topProducts} />

					<PeriodSummary stats={stats} days={days} />
			</View>
		</Screen>
	);
}

// ─── Selector de período ─────────────────────────────────────────────

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
	const options: { key: StatsPeriod; label: string }[] = [
		{ key: "week", label: strings.business.statsWeek },
		{ key: "month", label: strings.business.statsMonth },
		{ key: "year", label: strings.business.statsYear },
	];
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
				<Pressable
					onPress={() => onOffsetChange(offset - 1)}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.business.statsPreviousPeriod}
					style={styles.navBtn}
				>
					<Ionicons name="chevron-back" size={18} color={colors.foreground} />
				</Pressable>
				<View style={styles.rangeLabel}>
					<Ionicons
						name="time-outline"
						size={14}
						color={colors.mutedForeground}
					/>
					<AppText
						variant="bodySmall"
						weight="medium"
						numberOfLines={1}
						style={{ color: colors.mutedForeground }}
					>
						{rangeLabel(period, offset)}
					</AppText>
				</View>
				<Pressable
					onPress={() => onOffsetChange(offset + 1)}
					disabled={isCurrent}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.business.statsNextPeriod}
					style={[styles.navBtn, isCurrent && { opacity: 0.3 }]}
				>
					<Ionicons name="chevron-forward" size={18} color={colors.foreground} />
				</Pressable>
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
	icon,
	colorKey,
}: {
	label: string;
	value: string;
	change: number | null;
	icon: keyof typeof Ionicons.glyphMap;
	colorKey: "success" | "primary" | "warning" | "info";
}) {
	const { colors } = useTheme();
	const color = kpiColor(colors, colorKey);
	const positive = change != null && change >= 0;
	const trendColor =
		change == null ? colors.mutedForeground : positive ? colors.success : colors.destructive;

	return (
		<Card style={styles.kpi}>
			<View style={styles.kpiHeader}>
				<View style={[styles.kpiIcon, { backgroundColor: color + "26" }]}>
					<Ionicons name={icon} size={16} color={color} />
				</View>
				<AppText variant="bodySmall" numberOfLines={1} style={styles.flex1}>
					{label}
				</AppText>
			</View>
			<AppText variant="h3" weight="bold" style={{ color }} numberOfLines={1}>
				{value}
			</AppText>
			{change != null ? (
				<View style={styles.trendRow}>
					<Ionicons
						name={positive ? "trending-up" : "trending-down"}
						size={13}
						color={trendColor}
					/>
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
				</View>
			) : null}
		</Card>
	);
}

// ─── Gráfico de ventas diarias ───────────────────────────────────────

function DailyRevenueChart({ dailyStats }: { dailyStats: BusinessStats["dailyStats"] }) {
	const { colors } = useTheme();
	const maxRevenue = Math.max(...dailyStats.map((d) => d.revenue), 0);

	return (
		<Card style={styles.cardGap}>
			<View style={styles.cardHeader}>
				<Ionicons name="calendar-outline" size={18} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{strings.business.dailyChart}
				</AppText>
			</View>
			{dailyStats.length === 0 || maxRevenue === 0 ? (
				<View style={styles.emptyState}>
					<Ionicons
						name="bar-chart-outline"
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
					<View key={stat.day} style={styles.chartRow}>
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
					</View>
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
			<AppText variant="h4" weight="bold">
				{strings.business.topProducts}
			</AppText>
			{products.length === 0 ? (
				<View style={styles.emptyState}>
					<Ionicons
						name="cube-outline"
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
					<View key={product.name} style={styles.productRow}>
						<View
							style={[styles.rankCircle, { backgroundColor: colors.primary + "1A" }]}
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
					</View>
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
	const dailyAvg = stats.revenue > 0 ? (stats.revenue / days).toFixed(2) : "0.00";
	const ticketAvg =
		stats.ordersCount > 0 ? (stats.revenue / stats.ordersCount).toFixed(2) : "0.00";

	return (
		<View style={[styles.summary, { backgroundColor: colors.primary, boxShadow: `0px 4px 12px ${colors.primary}4D` }]}>
			<AppText
				variant="bodyMedium"
				weight="semiBold"
				style={{ color: colors.primaryForeground }}
			>
				{strings.business.statsSummary}
			</AppText>
			<AppText
				variant="bodySmall"
				style={{ color: colors.primaryForeground + "E6", marginTop: spacing.sm }}
			>
				{`Tus ventas han ${
					stats.revenueChange >= 0 ? "crecido" : "decaído"
				} un ${Math.abs(stats.revenueChange).toFixed(1)}% comparado con el período anterior. Has rescatado ${
					stats.rescuedCount
				} comidas, evitando el desperdicio de alimentos.`}
			</AppText>
			<View style={styles.summaryRow}>
				<View style={styles.flex1}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.primaryForeground + "BF" }}
					>
						{strings.business.dailyAvg}
					</AppText>
					<AppText variant="h2" weight="bold" style={{ color: colors.primaryForeground }}>
						${dailyAvg}
					</AppText>
				</View>
				<View style={styles.flex1}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.primaryForeground + "BF" }}
					>
						{strings.business.avgTicket}
					</AppText>
					<AppText variant="h2" weight="bold" style={{ color: colors.primaryForeground }}>
						${ticketAvg}
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
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	kpiGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.md,
		marginTop: spacing.lg,
	},
	kpi: { flexBasis: "47%", flex: 1, gap: 6 },
	kpiHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	kpiIcon: {
		width: 30,
		height: 30,
		borderRadius: 8,
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
		borderRadius: 4,
		marginTop: spacing.xs,
		overflow: "hidden",
	},
	chartBar: { height: "100%", borderRadius: 4 },
	productRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	rankCircle: {
		width: 28,
		height: 28,
		borderRadius: 14,
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
});
