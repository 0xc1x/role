import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { OrderDetail } from "@/features/orders/domain/order";

export function ProductItemsCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	return (
		<View>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.productTitle.toUpperCase()}
			</AppText>
			<View
				style={[
					styles.itemRow,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<View style={[styles.itemQty, { backgroundColor: colors.secondary }]}>
					<AppText
						style={[styles.itemQtyText, { color: colors.secondaryForeground }]}
					>
						1
					</AppText>
				</View>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					numberOfLines={2}
					style={styles.itemTitle}
				>
					{item.offerTitle}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.md,
	},
	itemQty: {
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	itemQtyText: { fontWeight: "700", fontSize: 14 },
	itemTitle: { flex: 1 },
});
