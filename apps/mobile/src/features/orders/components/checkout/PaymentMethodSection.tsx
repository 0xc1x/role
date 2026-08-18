import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

/**
 * Payment method section in checkout (ported from Rolé v1
 * `PaymentMethodSection`). Phase 1 always pays at pickup; saved cards are
 * device-local and only accelerate a future checkout, so they are listed
 * as informational rows without selection.
 */
export function PaymentMethodSection() {
	const { colors } = useTheme();

	return (
		<Card>
			<AppText
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.checkout.paymentMethodTitle.toUpperCase()}
			</AppText>
			<View
				style={[
					styles.methodRow,
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.border + "99",
					},
				]}
			>
				<View
					style={[styles.iconBox, { backgroundColor: colors.secondary + "4D" }]}
				>
					<Ionicons name="cash-outline" size={18} color={colors.primary} />
				</View>
				<AppText variant="bodyMedium" weight="semiBold" style={styles.methodLabel}>
					{strings.checkout.payAtPickup}
				</AppText>
				<Ionicons
					name="radio-button-on"
					size={20}
					color={colors.primary}
					accessibilityLabel={strings.checkout.paymentMethodTitle}
				/>
			</View>
			<AppText style={[styles.hint, { color: colors.mutedForeground }]}>
				{strings.paymentMethods.payAtPickupHint}
			</AppText>
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
	methodRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 12,
		padding: spacing.md,
	},
	iconBox: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	methodLabel: { flex: 1 },
	hint: { fontSize: 12, lineHeight: 16, marginTop: spacing.sm },
});