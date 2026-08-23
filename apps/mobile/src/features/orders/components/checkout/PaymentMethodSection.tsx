import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { useState } from "react";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { useAuthStore } from "@/features/auth/store";
import { usePaymentMethods } from "@/features/profile/hooks";

/**
 * Selectable payment methods: cash (pay at pickup) + saved tokenized cards.
 * No real charge yet — selection is UI only until gateway SDK lands.
 */
export function PaymentMethodSection() {
	const { colors } = useTheme();
	const { profile } = useAuthStore();
	const { data: methods } = usePaymentMethods(profile?.id ?? "");
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
						backgroundColor: selected === "cash" ? colors.primary + "14" : colors.inputBackground,
						borderColor: selected === "cash" ? colors.primary : colors.borderSolid,
					},
				]}
			>
				<View style={[styles.iconBox, { backgroundColor: colors.secondary + "4D" }]}>
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

			{(methods ?? []).map((m) => (
				<Pressable
					key={m.id}
					onPress={() => setSelected(m.id)}
					style={[
						styles.methodRow,
						{ marginTop: spacing.sm,
							backgroundColor: selected === m.id ? colors.primary + "14" : colors.inputBackground,
							borderColor: selected === m.id ? colors.primary : colors.borderSolid,
						},
					]}
				>
					<View style={[styles.iconBox, { backgroundColor: colors.inputBackground }]}>
						<Ionicons name="card-outline" size={18} color={colors.primary} />
					</View>
					<View style={{ flex: 1 }}>
						<AppText variant="bodyMedium" weight="semiBold">•••• {m.last4}</AppText>
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>{m.cardHolder} · {m.expiryMonth}/{m.expiryYear}</AppText>
					</View>
					<Ionicons name={selected === m.id ? "radio-button-on" : "radio-button-off"} size={20} color={colors.primary} />
				</Pressable>
			))}

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