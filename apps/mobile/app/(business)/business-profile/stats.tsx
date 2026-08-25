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
import { formatMoney, formatPercent } from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { BusinessStats } from "@/features/business/domain/business";

type Period = "week" | "month" | "year";

const MONTH_ABBR = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

function rangeFor(period: Period): { start: string; end: string } {
	const end = new Date();
	const start = new Date(end);
	if (period === "week") start.setDate(start.getDate() - 6);
	if (period === "month") start.setDate(1);
	if (period === "year") {
		start.setMonth(0);
		start.setDate(1);
	}
	start.setHours(0, 0, 0, 0);
	return { start: start.toISOString(), end: end.toISOString() };
}

function rangeLabel(period: Period): string {
	const now = new Date();
	const start = new Date(rangeFor(period).start);
	return `${start.getDate()} ${MONTH_ABBR[start.getMonth()]} – ${now.getDate()} ${MONTH_ABBR[now.getMonth()]} ${now.getFullYear()}`;
}

export default function BusinessStatsScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];
	const [period, setPeriod] = useState<Period>("week");
	const range = useMemo(() => rangeFor(period), [period]);
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
				<ScreenHeader title={strings.business.statistics} />
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: -spacing.md }}
				>
					{strings.business.statsSubtitle}
				</AppText>

				<PeriodSelector period={period} onChange={setPeriod} />

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

				<PeriodSummary stats={stats} period={period} />
			</View>
		</Screen>
	);
}

// ─── Selector de período ─────────────────────────────────────────────

function PeriodSelector({
	period,
	onChange,
}: {
	period: Period;
	onChange: (p: Period) => void;
}) {
	const { colors } = useTheme();
	const options: { key: Period; label: string }[] = [
		{ key: "week", label: strings.business.statsWeek },
		{ key: "month", label: strings.business.statsMonth },
		{ key: "year", label: strings.business.statsYear },
	];

	return (
		<View>
			<View style={styles.periodRow}>
				{options.map((option) => {
					const active = period === option.key;
					return (
						<Pressable
							key={option.key}
							onPress={() => onChange(option.key)}
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
				<Ionicons
					name="time-outline"
					size={14}
					color={colors.mutedForeground}
				/>
				<AppText
					variant="bodySmall"
					weight="medium"
					style={{ color: colors.mutedForeground }}
				>
					{rangeLabel(period)}
				</AppText>
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

const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

function PeriodSummary({
	stats,
	period,
}: {
	stats: BusinessStats;
	period: Period;
}) {
	const { colors } = useTheme();
	const days = PERIOD_DAYS[period];
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
		gap: 4,
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
