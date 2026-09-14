import { strings } from "@/core/i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { StyleSheet, View } from "react-native";
import type { OrderStats } from "@/features/business/domain/orders";
import { StatsMetricsCard } from "../StatsMetricsCard";

/**
 * Headline order metrics (ported from Rolé v1 `OrderStatsRow`):
 * Pendientes / Listos / Hoy.
 */
export function OrderStatsRow({ stats }: { stats: OrderStats }) {
	const { colors } = useTheme();

	const items = [
		{
			label: strings.business.ordersPendingStat,
			value: stats.pendingCount,
			icon: "time-outline" as const,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
		{
			label: strings.business.ordersReadyStat,
			value: stats.readyCount,
			icon: "bag-check-outline" as const,
			color: colors.info,
			bg: colors.infoSurface,
		},
		{
			label: strings.business.ordersTodayStat,
			value: stats.todayCompletedCount,
			icon: "checkmark-circle-outline" as const,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
	];

	return <StatsMetricsCard items={items} />;
}

/**
 * Skeleton con las dimensiones aproximadas de la fila de métricas
 * (3 columnas con chip 32 + valor + etiqueta).
 * Mismo patrón que ProductCardSkeleton / OrderCardSkeleton.
 */
export function OrderStatsRowSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.skeletonRow,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			{[0, 1, 2].map((i) => (
				<View key={`order-stats-skeleton-${i}`} style={styles.skeletonItem}>
					<Skeleton style={styles.skeletonChip} />
					<Skeleton style={styles.skeletonValue} />
					<Skeleton style={styles.skeletonLabel} />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	skeletonRow: {
		flexDirection: "row",
		borderRadius: radii.xl,
		borderWidth: 1,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "space-around",
	},
	skeletonItem: {
		flex: 1,
		alignItems: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.xs,
	},
	skeletonChip: {
		width: 32,
		height: 32,
		borderRadius: radii.pill,
		marginBottom: spacing.xs,
	},
	skeletonValue: {
		height: 20,
		width: 36,
		borderRadius: radii.sm,
	},
	skeletonLabel: {
		height: 12,
		width: "70%",
		borderRadius: radii.sm,
	},
});