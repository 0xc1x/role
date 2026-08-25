import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { OrdersTab } from "@/features/business/domain/orders";

/**
 * Activos / Historial segmented control
 * (ported from Rolé v1 `TabSelector`).
 */
export function OrdersTabs({
	tab,
	onChange,
}: {
	tab: OrdersTab;
	onChange: (tab: OrdersTab) => void;
}) {
	const { colors } = useTheme();
	const tabs: Array<{ key: OrdersTab; label: string }> = [
		{ key: "active", label: strings.business.ordersTabActive },
		{ key: "history", label: strings.business.ordersTabHistory },
	];

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: colors.inputBackground, borderColor: colors.borderSolid },
			]}
		>
			{tabs.map((item) => {
				const selected = item.key === tab;
				return (
					<Pressable
						key={item.key}
						onPress={() => onChange(item.key)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						style={({ pressed }) => [
							styles.tab,
							{
								backgroundColor: selected ? colors.card : "transparent",
								boxShadow: selected ? `0px 2px 4px ${colors.cardShadow}` : undefined,
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<AppText
							variant="bodySmall"
							weight={selected ? "semiBold" : "regular"}
							style={{ color: selected ? colors.foreground : colors.mutedForeground }}
						>
							{item.label}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		borderRadius: radii.pill,
		borderWidth: 1,
		padding: 3,
		gap: 2,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
	},
});