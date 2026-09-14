import type { Order } from "@0xc1x/role-commons";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { radii, spacing } from "@/core/theme/spacing";
import {
	PickupQr,
} from "@/features/orders/components/pickup-qr";

export function PickupCodeCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	if (!order.pickup_code) return null;

	const handleCopy = () => {
		void Clipboard.setStringAsync(order.pickup_code).then(() => {
			toast.success(strings.orders.codeCopied);
		});
	};

	return (
		<View
			style={[
				styles.pickupCard,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<AppText
				variant="caption"
				weight="bold"
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.orders.yourCode.toUpperCase()}
			</AppText>
			<PickupQr orderId={order.id} pickupCode={order.pickup_code} />
			<View style={styles.codeRow}>
				<AppText style={[styles.pickupCode, { color: colors.primary }]}>
					{order.pickup_code}
				</AppText>
				<Button
					label={strings.orders.copyCode}
					variant="outline"
					size="sm"
					onPress={handleCopy}
				/>
			</View>
			<AppText
				variant="bodySmall"
				style={[styles.sectionNote, { color: colors.mutedForeground }]}
			>
				{strings.orders.pickupCodeHint}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	pickupCard: {
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.lg,
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
		fontWeight: "800",
		letterSpacing: 8,
	},
	sectionLabel: {
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
	sectionNote: {
		textAlign: "center",
	},
});
