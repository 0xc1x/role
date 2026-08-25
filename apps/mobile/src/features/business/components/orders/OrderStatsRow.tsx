import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { OrderStats } from "@/features/business/domain/orders";

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

	return (
		<View
			style={[
				styles.row,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					boxShadow: `0px 4px 16px ${colors.cardShadow}`,
				},
			]}
		>
			{items.map((item, index) => (
				<Fragment key={item.label}>
					{index > 0 ? (
						<View
							style={{
								width: StyleSheet.hairlineWidth,
								backgroundColor: colors.borderSolid,
							}}
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