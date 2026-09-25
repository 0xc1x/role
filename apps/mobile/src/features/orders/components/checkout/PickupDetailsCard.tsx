import { Clock, MapPin, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { formatRelativeDay, formatTime } from "@/src/core/utils/formatters";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import type { EmbeddedLocation } from "@/src/features/offers/domain/offer";
import type { Offer } from "@0xc1x/role-commons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface PickupDetailsCardProps {
	offer: Offer;
	location: EmbeddedLocation | null;
}

/** Pickup details (address + window) in checkout (ported from Rolé v1 `PickupDetailsCard`). */
export function PickupDetailsCard({ offer, location }: PickupDetailsCardProps) {
	const { colors, scheme } = useTheme();
	const day = formatRelativeDay(offer.pickup_start);
	const window = strings.checkout.pickupWindow
		.replace("{day}", day)
		.replace("{start}", formatTime(offer.pickup_start))
		.replace("{end}", formatTime(offer.pickup_end));

	return (
		<Card
			style={[
				{
					backgroundColor: scheme === "dark" ? colors.card : colors.background,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<CardHeader>
				<AppText
					variant="h4"
					weight="bold"
					style={{ flex: 1, color: colors.mutedForeground }}
				>
					{strings.checkout.pickupDetailsTitle}
				</AppText>
			</CardHeader>
			<CardContent style={styles.body}>
				<InfoRow
					icon={MapPin}
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
					<Clock size={18} color={colors.successDark} />
					<AppText style={[styles.windowText, { color: colors.successDark }]}>
						{window}
					</AppText>
				</View>
			</CardContent>
		</Card>
	);
}

function InfoRow({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Icon size={16} color={colors.mutedForeground} />
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
	body: { gap: spacing.sm },
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
		borderRadius: radii.md,
		padding: spacing.md,
		marginTop: spacing.sm,
	},
	windowText: { flex: 1, fontSize: 13, fontWeight: "600" },
});
