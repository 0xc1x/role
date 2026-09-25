import type { Order } from "@0xc1x/role-commons";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { PickupQr } from "@/src/features/orders/components/pickup-qr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PickupCodeCard({ order }: { order: Order }) {
	const { colors, scheme } = useTheme();
	if (!order.pickup_code) return null;

	const handleCopy = () => {
		void Clipboard.setStringAsync(order.pickup_code).then(() => {
			toast.success(strings.orders.codeCopied);
		});
	};

	return (
		<Card>
			<CardHeader>
				<AppText variant="h4" weight="bold">
					{strings.orders.yourCode}
				</AppText>
			</CardHeader>
			<View style={styles.body}>
				<PickupQr orderId={order.id} pickupCode={order.pickup_code} />
				<View
					style={{ display: "flex", flexDirection: "row", gap: spacing.md }}
				>
					<AppText
						style={[styles.pickupCode, { color: colors.primary }]}
						numberOfLines={1}
					>
						{order.pickup_code}
					</AppText>
					<Button variant="secondary" size="sm" onPress={handleCopy}>
						{strings.orders.copyCode}
					</Button>
				</View>

				<AppText
					variant="bodySmall"
					style={[styles.hint, { color: colors.mutedForeground }]}
				>
					{strings.orders.pickupCodeHint}
				</AppText>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	body: {
		alignItems: "center",
		gap: spacing.md,
	},
	codeRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.md,
		flexWrap: "wrap",
	},
	// Display one-off: código de recogida (no es escala tipográfica).
	pickupCode: {
		fontSize: 34,
		fontWeight: "700", // peso que exista realmente en la fuente
		lineHeight: 42, // ≥ fontSize con aire para descendentes
		includeFontPadding: false,
	},
	hint: {
		textAlign: "center",
	},
});
