import { StyleSheet, View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { spacing, radii } from "@/src/core/theme/spacing";
import { Package, ShoppingBag, TrendingUp } from "lucide-react-native";
import { typography } from "@/src/core/theme/typography";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import type { ProductStats } from "@/src/features/business/domain/products";
import { StatsMetricsCard } from "../StatsMetricsCard";

/**
 * Headline metrics strip (ported from Rolé v1 `StatsRow`):
 * Activos / Vendidos hoy / Disponibles.
 */
export function BusinessStatsRow({ stats }: { stats: ProductStats }) {
	const { colors } = useTheme();

	const items = [
		{
			label: strings.business.activeProducts,
			value: stats.activeCount,
			icon: ShoppingBag,
			color: colors.destructiveVibrant,
			bg: colors.destructiveSurface,
		},
		{
			label: strings.business.soldToday,
			value: stats.soldToday,
			icon: TrendingUp,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
		{
			label: strings.business.availableStock,
			value: stats.availableCount,
			icon: Package,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
	];

	return <StatsMetricsCard items={items} />;
}

export function BusinessStatsRowSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			accessible
			accessibilityLabel={strings.common.loading}
			accessibilityState={{ busy: true }}
			testID="business-stats-skeleton"
			style={[
				styles.row,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			{[0, 1, 2].map((index) => (
				<View key={index} style={styles.item}>
					<Skeleton style={styles.icon} />
					<Skeleton style={styles.value} />
					<Skeleton style={styles.label} />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		borderRadius: radii.xl,
		borderWidth: 1,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "space-around",
	},
	item: {
		flex: 1,
		alignItems: "center",
		gap: 2,
		paddingHorizontal: spacing.xs,
	},
	icon: {
		width: 32,
		height: 32,
		borderRadius: radii.pill,
		marginBottom: spacing.xs,
	},
	value: {
		height: typography.h3.lineHeight,
		width: "40%",
		borderRadius: radii.sm,
	},
	label: {
		height: typography.bodySmall.lineHeight,
		width: "85%",
		borderRadius: radii.sm,
	},
});
