import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, ErrorState, LoadingView, Screen } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useBusinesses, useBusinessStats } from "@/features/business/hooks";
import { formatMoney, formatPercent } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

function lastWeek(): { start: string; end: string } {
	const end = new Date();
	const start = new Date(end.getTime() - 6 * 86400000);
	return { start: start.toISOString(), end: end.toISOString() };
}

export default function BusinessStatsScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];
	const [range] = useState(() => lastWeek());
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
	if (!stats) return null;

	const statCards = [
		{
			label: strings.business.revenue,
			value: formatMoney(stats.revenue),
			delta: stats.revenueChange,
		},
		{
			label: strings.business.ordersCount,
			value: String(stats.ordersCount),
			delta: stats.ordersChange,
		},
		{
			label: strings.business.avgRating,
			value: stats.avgRating.toFixed(1),
			delta: null,
		},
	];

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.business.statistics}
				</AppText>

				<View style={styles.cards}>
					{statCards.map((c) => (
						<Card key={c.label} style={styles.statCard}>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{c.label}
							</AppText>
							<AppText variant="h3" weight="bold">
								{c.value}
							</AppText>
							{c.delta != null ? (
								<AppText
									variant="bodySmall"
									style={{
										color: c.delta >= 0 ? colors.success : colors.destructive,
									}}
								>
									{c.delta >= 0 ? "��" : "��"} {formatPercent(Math.abs(c.delta))}
								</AppText>
							) : null}
						</Card>
					))}
				</View>

				<Card style={{ marginTop: spacing.lg }}>
					<AppText
						variant="h4"
						weight="bold"
						style={{ marginBottom: spacing.md }}
					>
						{strings.business.dailyChart}
					</AppText>
					{stats.dailyStats.map((d) => (
						<View key={d.day} style={styles.rowBetween}>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{d.day}
							</AppText>
							<AppText variant="bodySmall">
								{d.orders} {d.orders === 1 ? "pedido" : "pedidos"} ·{" "}
								{formatMoney(d.revenue)}
							</AppText>
						</View>
					))}
				</Card>

				<Card style={{ marginTop: spacing.md }}>
					<AppText
						variant="h4"
						weight="bold"
						style={{ marginBottom: spacing.md }}
					>
						{strings.business.topProducts}
					</AppText>
					{stats.topProducts.map((p, i) => (
						<View
							key={p.name}
							style={[styles.rowBetween, { marginBottom: spacing.sm }]}
						>
							<AppText variant="bodyMedium">
								{i + 1}. {p.name}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{p.sold} · {formatMoney(p.revenue)}
							</AppText>
						</View>
					))}
				</Card>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	cards: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
	statCard: { flex: 1, gap: 2 },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});