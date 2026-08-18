import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { EmbeddedBusiness, EmbeddedLocation } from "@/features/offers/domain/offer";
import type { ReservationSuccess } from "@/features/orders/domain/order";

interface ConfirmationViewProps {
	result: ReservationSuccess;
	business: EmbeddedBusiness;
	location: EmbeddedLocation | null;
}

/**
 * Post-reservation success screen (ported from Rolé v1 `ConfirmationView`):
 * pickup ticket with QR + code, business card and exit actions.
 */
export function ConfirmationView({
	result,
	business,
	location,
}: ConfirmationViewProps) {
	const { colors } = useTheme();
	const qrValue = `role://order/${result.orderId}/${result.pickupCode}`;

	return (
		<View style={styles.wrap}>
			<View style={styles.successHeader}>
				<Ionicons name="checkmark-circle" size={54} color={colors.ecoGreen} />
				<AppText variant="h3" weight="bold" style={styles.successTitle}>
					{strings.checkout.reservationSuccessTitle}
				</AppText>
				<AppText style={[styles.successMessage, { color: colors.mutedForeground }]}>
					{strings.checkout.reservationSuccessMessage}
				</AppText>
			</View>

			<View
				style={[
					styles.ticket,
					{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				]}
			>
				<AppText style={[styles.ticketLabel, { color: colors.mutedForeground }]}>
					{strings.checkout.ticketTitle.toUpperCase()}
				</AppText>
				<View
					style={[
						styles.qrBox,
						{ borderColor: colors.borderSolid, backgroundColor: "#FFFFFF" },
					]}
				>
					<QRCode
						value={qrValue}
						size={176}
						color="#131316"
						backgroundColor="#FFFFFF"
					/>
				</View>
				<AppText style={[styles.pickupCode, { color: colors.primary }]}>
					{result.pickupCode}
				</AppText>
				<AppText style={[styles.orderNumber, { color: colors.mutedForeground }]}>
					{strings.checkout.ticketOrder.replace("{n}", result.orderNumber)}
				</AppText>
				<AppText style={[styles.pickupInfo, { color: colors.mutedForeground }]}>
					{location?.address ?? business.name}
				</AppText>
			</View>

			<View
				style={[
					styles.businessCard,
					{ backgroundColor: colors.muted, borderColor: colors.borderSolid },
				]}
			>
				<Ionicons name="storefront" size={20} color={colors.primary} />
				<View style={styles.businessBody}>
					<AppText variant="labelSmall" weight="bold" numberOfLines={1}>
						{business.name}
					</AppText>
					{location?.address ? (
						<AppText
							variant="bodySmall"
							numberOfLines={1}
							style={{ color: colors.mutedForeground }}
						>
							{location.address}
						</AppText>
					) : null}
				</View>
			</View>

			<View style={styles.actions}>
				<Button
					label={strings.checkout.viewOrder}
					variant="primary"
					fullWidth
					onPress={() => router.replace(`/order/${result.orderId}`)}
				/>
				<Button
					label={strings.checkout.moreOffers}
					variant="outline"
					fullWidth
					onPress={() => router.replace("/")}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: spacing.lg },
	successHeader: { alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
	successTitle: { textAlign: "center" },
	successMessage: { textAlign: "center" },

	ticket: {
		borderRadius: 20,
		borderWidth: 1.5,
		padding: spacing.lg,
		alignItems: "center",
		gap: spacing.md,
	},
	ticketLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
	},
	qrBox: {
		padding: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	pickupCode: {
		fontSize: 32,
		fontWeight: "800",
		letterSpacing: 6,
	},
	orderNumber: { fontSize: 13 },
	pickupInfo: { fontSize: 12, textAlign: "center" },

	businessCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.md,
		padding: spacing.md,
	},
	businessBody: { flex: 1 },

	actions: { gap: spacing.sm },
});