import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { ProductStats } from "@/features/business/domain/products";

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
			icon: "bag-handle-outline" as const,
			color: colors.destructiveVibrant,
			bg: colors.destructiveSurface,
		},
		{
			label: strings.business.soldToday,
			value: stats.soldToday,
			icon: "trending-up" as const,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
		{
			label: strings.business.availableStock,
			value: stats.availableCount,
			icon: "cube-outline" as const,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
	];

	return (
		<View
			style={[
				styles.row,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					shadowColor: colors.cardShadow,
				},
			]}
		>
			{items.map((item, index) => (
				<Fragment key={item.label}>
					{index > 0 ? (
						<View
							style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.borderSolid }}
						/>
					) : null}
					<View style={styles.item}>
						<View style={[styles.iconChip, { backgroundColor: item.bg }]}>
							<Ionicons name={item.icon} size={16} color={item.color} />
						</View>
						<AppText variant="h3" weight="extraBold" style={{ color: item.color }}>
							{item.value}
						</AppText>
						<AppText
							variant="bodySmall"
							numberOfLines={1}
							style={{ color: colors.mutedForeground, textAlign: "center" }}
						>
							{item.label}
						</AppText>
					</View>
				</Fragment>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "stretch",
		borderRadius: radii.lg,
		borderWidth: 1,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 1,
		shadowRadius: 16,
		elevation: 2,
	},
	item: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.lg,
		gap: 2,
	},
	iconChip: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.xs,
	},
});