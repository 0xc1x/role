import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatMoneyPrecise } from "@/core/utils/formatters";
import { orderDiscount } from "@/features/orders/domain/order";

export function PriceDetailsCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const discount = orderDiscount(order);
	return (
		<Card style={styles.cardBlock}>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.summaryTitle.toUpperCase()}
			</AppText>
			<View style={styles.priceRow}>
				<AppText style={[styles.priceLabel, { color: colors.mutedForeground }]}>
					{strings.orders.originalPriceLabel}
				</AppText>
				<AppText
					style={[
						styles.priceValue,
						{
							color: colors.mutedForeground,
							textDecorationLine: "line-through",
						},
					]}
				>
					{formatMoneyPrecise(order.original_price)}
				</AppText>
			</View>
			<View style={styles.priceRow}>
				<AppText style={[styles.priceLabel, { color: colors.success }]}>
					{strings.orders.discountLabel}
				</AppText>
				<AppText style={[styles.priceValue, { color: colors.success }]}>
					-{formatMoneyPrecise(discount)}
				</AppText>
			</View>
			<View style={[styles.divider, { backgroundColor: colors.border }]} />
			<View style={styles.priceRow}>
				<AppText variant="h4" weight="bold" style={styles.totalLabel}>
					{strings.orders.totalLabel}
				</AppText>
				<AppText style={[styles.totalValue, { color: colors.primary }]}>
					{formatMoneyPrecise(order.price)}
				</AppText>
			</View>
			<View
				style={[
					styles.ecoBox,
					{
						backgroundColor: colors.surfaceSuccess,
						borderColor: colors.surfaceSuccessBorder,
					},
				]}
			>
				<Ionicons name="leaf-outline" size={18} color={colors.success} />
				<AppText style={[styles.ecoText, { color: colors.success }]}>
					{strings.orders.ecoSaved.replace("{saved}", formatMoneyPrecise(discount))}
				</AppText>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	cardBlock: { gap: spacing.sm },
	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	priceLabel: { fontSize: 13, flex: 1 },
	priceValue: { fontSize: 13 },
	totalLabel: { flex: 1 },
	totalValue: { fontSize: 18, fontWeight: "800" },
	divider: { height: 1, marginVertical: spacing.sm },
	ecoBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.lg,
		padding: spacing.md,
		marginTop: spacing.sm,
	},
	ecoText: { flex: 1, fontSize: 13, fontWeight: "600" },
});
