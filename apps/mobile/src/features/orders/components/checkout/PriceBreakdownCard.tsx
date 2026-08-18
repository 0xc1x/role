import { Ionicons } from "@expo/vector-icons";
import type { Coupon, Offer } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { formatMoney, formatMoneyPrecise } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { couponDiscount } from "@/features/orders/domain/order";

interface PriceBreakdownCardProps {
	offer: Offer;
	appliedCoupon: Coupon | null;
}

/** Price breakdown in checkout (ported from Rolé v1 `PriceBreakdownCard`). */
export function PriceBreakdownCard({ offer, appliedCoupon }: PriceBreakdownCardProps) {
	const { colors } = useTheme();
	const offerDiscount = offer.original_price - offer.discounted_price;
	const coupon = appliedCoupon ? couponDiscount(appliedCoupon, offer.discounted_price) : 0;
	const total = Math.max(offer.discounted_price - coupon, 0);

	return (
		<Card>
			<AppText
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.checkout.orderSummary.toUpperCase()}
			</AppText>
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
					{strings.orders.ecoSaved.replace(
						"{saved}",
						formatMoneyPrecise(offerDiscount + coupon),
					)}
				</AppText>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.sm,
	},
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
	ecoBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 12,
		padding: spacing.md,
		marginTop: spacing.sm,
	},
	ecoText: { flex: 1, fontSize: 13, fontWeight: "600" },
});