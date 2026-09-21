import { PiggyBank } from "lucide-react-native";
import type { Coupon, Offer } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { formatMoney, formatMoneyPrecise } from "@/src/core/utils/formatters";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { checkoutTotals } from "@/src/features/orders/domain/order";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface PriceBreakdownCardProps {
	offer: Offer;
	appliedCoupon: Coupon | null;
}

/** Price breakdown in checkout (ported from Rolé v1 `PriceBreakdownCard`). */
export function PriceBreakdownCard({ offer, appliedCoupon }: PriceBreakdownCardProps) {
	const { colors, scheme } = useTheme();
	const totals = checkoutTotals(offer, appliedCoupon);
	const offerDiscount = totals.offerDiscount;
	const coupon = totals.coupon;
	const total = totals.total;

	return (
		<Card
			style={{
				backgroundColor: scheme === "dark" ? colors.card : colors.background,
				borderColor: colors.borderSolid,
			}}>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1, color: colors.mutedForeground }}>
					{strings.checkout.orderSummary}
				</AppText>
			</CardHeader>
			<CardContent style={styles.body}>
			<View style={styles.priceRow}>
				<AppText style={[styles.label, { color: colors.mutedForeground }]}>
					{strings.checkout.subtotal}
				</AppText>
				<AppText style={styles.value}>{formatMoney(offer.original_price)}</AppText>
			</View>
			<View style={styles.priceRow}>
				<AppText style={[styles.label, { color: colors.success }]}>
					{strings.checkout.discount}
				</AppText>
				<AppText style={[styles.value, { color: colors.success }]}>
					-{formatMoney(offerDiscount)}
				</AppText>
			</View>
			{appliedCoupon ? (
				<View style={styles.priceRow}>
					<AppText style={[styles.label, { color: colors.primary }]}>
						{strings.checkout.couponApplied} · {appliedCoupon.code}
					</AppText>
					<AppText style={[styles.value, { color: colors.primary }]}>
						-{formatMoney(coupon)}
					</AppText>
				</View>
			) : null}
			<View style={[styles.divider, { backgroundColor: colors.border }]} />
			<View style={styles.priceRow}>
				<AppText variant="h4" weight="bold" style={styles.totalLabel}>
					{strings.checkout.total}
				</AppText>
				<AppText variant="priceLarge" style={{ color: colors.primary }}>
					{formatMoney(total)}
				</AppText>
			</View>
			<Alert variant="success" icon={PiggyBank}>
				<AlertDescription>
					<AppText style={[styles.ecoText, { color: colors.success }]}>
						{strings.orders.moneySaved.replace(
							"{saved}",
							formatMoneyPrecise(offerDiscount + coupon),
						)}
					</AppText>
				</AlertDescription>
			</Alert>
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
		paddingVertical: spacing.xs,
	},
	label: { fontSize: 13, flex: 1 },
	value: { fontSize: 13, fontWeight: "600" },
	totalLabel: { flex: 1 },
	divider: { height: 1, marginVertical: spacing.sm },
	ecoText: { flex: 1, fontSize: 13, fontWeight: "600" },
});