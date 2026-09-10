import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	PickupQr,
} from "@/features/orders/components/pickup-qr";

export function PickupCodeCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	if (!order.pickup_code) return null;
	return (
		<View
			style={[
				styles.pickupCard,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.orders.yourCode.toUpperCase()}
			</AppText>
			<AppText style={[styles.pickupCode, { color: colors.primary }]}>
				{order.pickup_code}
			</AppText>
			<PickupQr orderId={order.id} pickupCode={order.pickup_code} />
			<AppText style={[styles.sectionNote, { color: colors.mutedForeground }]}>
				{strings.orders.pickupCodeHint}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	pickupCard: {
		borderRadius: 24,
		borderWidth: 1,
		padding: spacing.lg,
		alignItems: "center",
		gap: spacing.md,
	},
	// Display one-off: código de recogida (no es escala tipográfica).
	pickupCode: {
		fontSize: 34,
		fontWeight: "800",
		letterSpacing: 8,
	},
	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	sectionNote: {
		fontSize: 12,
		textAlign: "center",
	},
});
