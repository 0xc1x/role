import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";

export interface MetricItem {
	label: string;
	value: number | string;
	icon: LucideIcon;
	color: string;
	bg: string;
}

export function StatsMetricsCard({ items }: { items: MetricItem[] }) {
	const { colors } = useTheme();

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
			{items.map((item, index) => {
				const Icon = item.icon;
				return (
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
								<Icon size={16} color={item.color} />
							</View>
							<AppText
								variant="h3"
								weight="extraBold"
								style={{ color: item.color }}
							>
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
				);
			})}
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
	iconChip: {
		width: 32,
		height: 32,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.xs,
	},
});
