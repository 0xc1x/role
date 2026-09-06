import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { useState } from "react";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { withAlpha } from "@/core/theme/alpha";

/**
 * Payment method selector: cash (pay at pickup) only.
 * Saved cards stay hidden until the payment gateway is enabled.
 */
export function PaymentMethodSection() {
	const { colors } = useTheme();
	const [selected, setSelected] = useState<string>("cash");

	return (
		<Card>
			<AppText style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
				{strings.checkout.paymentMethodTitle.toUpperCase()}
			</AppText>

			<Pressable
				onPress={() => setSelected("cash")}
				style={[
					styles.methodRow,
					{
						backgroundColor: selected === "cash" ? withAlpha(colors.primary, 0.078) : colors.inputBackground,
						borderColor: selected === "cash" ? colors.primary : colors.borderSolid,
					},
				]}
			>
				<View style={[styles.iconBox, { backgroundColor: withAlpha(colors.secondary, 0.302) }]}>
					<Ionicons name="cash-outline" size={18} color={colors.primary} />
				</View>
				<AppText variant="bodyMedium" weight="semiBold" style={styles.methodLabel}>
					{strings.checkout.payAtPickup}
				</AppText>
				<Ionicons
					name={selected === "cash" ? "radio-button-on" : "radio-button-off"}
					size={20}
					color={colors.primary}
				/>
			</Pressable>

			{/* Tarjetas guardadas: se muestran cuando la pasarela de pagos esté activa. */}

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
