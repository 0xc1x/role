import { Banknote } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Payment method: cash (pay at pickup) only — sin toggle (no hay más
 * opciones que elegir). Saved cards stay hidden until the gateway is enabled.
 */
export function PaymentMethodSection() {
	const { colors, scheme } = useTheme();

	return (
		<Card
			style={{
				backgroundColor: scheme === "dark" ? colors.card : colors.background,
				borderColor: colors.borderSolid,
			}}>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1, color: colors.mutedForeground }}>
					{strings.checkout.paymentMethodTitle}
				</AppText>
			</CardHeader>
			<CardContent style={styles.body}>

			<View
				style={[
					styles.methodRow,
					{
						backgroundColor: withAlpha(colors.primary, 0.078),
						borderColor: colors.primary,
					},
				]}
			>
				<View style={[styles.iconBox, { backgroundColor: withAlpha(colors.secondary, 0.302) }]}>
					<Banknote size={18} color={colors.primary} />
				</View>
				<AppText variant="bodyMedium" weight="semiBold" style={styles.methodLabel}>
					{strings.checkout.payAtPickup}
				</AppText>
			</View>

			{/* Tarjetas guardadas: se muestran cuando la pasarela de pagos esté activa. */}

			<AppText style={[styles.hint, { color: colors.mutedForeground }]}>
				{strings.paymentMethods.payAtPickupHint}
			</AppText>
			</CardContent>
		</Card>
	);
}

const styles = StyleSheet.create({
	body: { gap: spacing.sm },
	methodRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.md,
		padding: spacing.md,
	},
	iconBox: {
		width: 32,
		height: 32,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	methodLabel: { flex: 1 },
	hint: { fontSize: 12, lineHeight: 16, marginTop: spacing.sm },
});
