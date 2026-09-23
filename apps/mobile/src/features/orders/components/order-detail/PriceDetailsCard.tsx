import type { Order } from "@0xc1x/role-commons";
import { PiggyBank } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { formatMoney } from "@/src/core/utils/formatters";
import { orderDiscount } from "@/src/features/orders/domain/order";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PriceDetailsCard({ order }: { order: Order }) {
	const { colors, scheme } = useTheme();
	const discount = orderDiscount(order);
	return (
		<Card
			style={{
				backgroundColor: scheme === "dark" ? colors.card : colors.background,
				borderColor: colors.borderSolid,
			}}>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1, color: colors.mutedForeground }}>
					{strings.orders.summaryTitle}
				</AppText>
			</CardHeader>
			<CardContent style={styles.body}>
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
			<Alert variant="success" icon={PiggyBank}>
				<AlertDescription>
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.success, flex: 1 }}
					>
						{strings.orders.moneySaved.replace("{saved}", formatMoney(discount))}
					</AppText>
				</AlertDescription>
			</Alert>
			{/* Oculta hasta habilitar la pasarela de pagos: fila del método de
			    pago (p. ej. Visa ••••). Se conserva comentada, no se borra. */}
			</CardContent>
		</Card>
	);
}

const styles = StyleSheet.create({
	body: { gap: spacing.sm },
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	totalLabel: { flex: 1 },
	tabular: { fontVariant: ["tabular-nums"] },
	divider: { height: 1, marginVertical: spacing.sm },
});
