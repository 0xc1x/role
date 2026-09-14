import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatMoney } from "@/core/utils/formatters";
import { orderDiscount } from "@/features/orders/domain/order";

export function PriceDetailsCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const discount = orderDiscount(order);
	return (
		<Card style={styles.cardBlock}>
			<AppText
				variant="caption"
				weight="bold"
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.orders.summaryTitle.toUpperCase()}
			</AppText>
			<View style={styles.priceRow}>
				<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
					{strings.orders.originalPriceLabel}
				</AppText>
				<AppText variant="bodyMedium" style={styles.tabular}>
					{formatMoney(order.original_price)}
				</AppText>
			</View>
			<View style={styles.priceRow}>
				<AppText variant="bodyMedium" style={{ color: colors.success }}>
					{strings.orders.discountLabel}
				</AppText>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={[{ color: colors.success }, styles.tabular]}
				>
					-{formatMoney(discount)}
				</AppText>
			</View>
			<View style={[styles.divider, { backgroundColor: colors.border }]} />
			<View style={styles.priceRow}>
				<AppText variant="h4" weight="bold" style={styles.totalLabel}>
					{strings.orders.totalLabel}
				</AppText>
				<AppText variant="priceLarge" style={{ color: colors.primary }}>
					{formatMoney(order.price)}
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
				<Ionicons name="cash-outline" size={18} color={colors.success} />
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.success, flex: 1 }}
				>
					{strings.orders.moneySaved.replace("{saved}", formatMoney(discount))}
				</AppText>
			</View>
			{/* Oculta hasta habilitar la pasarela de pagos: fila del método de
			    pago (p. ej. Visa ••••). Se conserva comentada, no se borra. */}
		</Card>
	);
}

const styles = StyleSheet.create({
	cardBlock: { gap: spacing.sm },
	sectionLabel: {
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	totalLabel: { flex: 1 },
	tabular: { fontVariant: ["tabular-nums"] },
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
});
