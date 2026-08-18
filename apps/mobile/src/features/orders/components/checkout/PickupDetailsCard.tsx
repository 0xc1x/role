import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { formatRelativeDay, formatTime } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { EmbeddedLocation } from "@/features/offers/domain/offer";
import type { Offer } from "@0xc1x/role-commons";

interface PickupDetailsCardProps {
	offer: Offer;
	location: EmbeddedLocation | null;
}

/** Pickup details (address + window) in checkout (ported from Rolé v1 `PickupDetailsCard`). */
export function PickupDetailsCard({ offer, location }: PickupDetailsCardProps) {
	const { colors } = useTheme();
	const day = formatRelativeDay(offer.pickup_start);
	const window = strings.checkout.pickupWindow
		.replace("{day}", day)
		.replace("{start}", formatTime(offer.pickup_start))
		.replace("{end}", formatTime(offer.pickup_end));

	return (
		<Card>
			<AppText
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.checkout.pickupDetailsTitle.toUpperCase()}
			</AppText>
			<InfoRow
				icon="location-outline"
				label={strings.checkout.pickupAddressLabel}
				value={location?.address ?? strings.businessProfile.notAvailable}
			/>
			<View
				style={[
					styles.windowBox,
					{
						backgroundColor: colors.surfaceSuccess,
						borderColor: colors.surfaceSuccessBorder,
					},
				]}
			>
				<Ionicons name="time-outline" size={18} color={colors.successDark} />
				<AppText style={[styles.windowText, { color: colors.successDark }]}>
					{window}
				</AppText>
			</View>
		</Card>
	);
}

function InfoRow({
	icon,
	label,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={16} color={colors.mutedForeground} />
			<View style={styles.infoBody}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					{value}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.2,
		marginBottom: spacing.sm,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingVertical: spacing.xs,
	},
	infoBody: { flex: 1 },
	windowBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 12,
		padding: spacing.md,
		marginTop: spacing.sm,
	},
	windowText: { flex: 1, fontSize: 13, fontWeight: "600" },
});