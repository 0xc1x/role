import { CircleCheck, Store } from "lucide-react-native";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { PickupQr } from "@/src/features/orders/components/pickup-qr";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import type { EmbeddedBusiness, EmbeddedLocation } from "@/src/features/offers/domain/offer";
import { type ReservationSuccess, pickupQrValue } from "@/src/features/orders/domain/order";
import { Button } from "@/components/ui/button";

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

	return (
		<View style={styles.wrap}>
			<View style={styles.successHeader}>
				<CircleCheck size={54} color={colors.ecoGreen} fill={colors.ecoGreen} />
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
				<PickupQr orderId={result.orderId} pickupCode={result.pickupCode} />
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
				<Store size={20} color={colors.primary} fill={colors.primary} />
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
					fullWidth
					onPress={() => router.replace(`/order/${result.orderId}`)}
				>
					{strings.checkout.viewOrder}
				</Button>
				<Button
					variant="outline"
					fullWidth
					onPress={() => router.replace("/")}
				>
					{strings.checkout.moreOffers}
				</Button>
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
		borderRadius: radii.xl,
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