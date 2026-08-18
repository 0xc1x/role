import { Image, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { formatMoney } from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import {
	discountPercentage,
	type EmbeddedBusiness,
	type EmbeddedLocation,
} from "@/features/offers/domain/offer";
import type { Offer } from "@0xc1x/role-commons";

interface ProductSummaryCardProps {
	offer: Offer;
	business: EmbeddedBusiness;
	location: EmbeddedLocation | null;
}

/** Offer summary at the top of checkout (ported from Rolé v1 `ProductSummaryCard`). */
export function ProductSummaryCard({
	offer,
	business,
}: ProductSummaryCardProps) {
	const { colors } = useTheme();
	const percent = discountPercentage(offer);

	return (
		<Card>
			<View style={styles.row}>
				{offer.image ? (
					<Image source={{ uri: offer.image }} style={styles.image} />
				) : (
					<View
						style={[styles.image, { backgroundColor: colors.surfaceMuted }]}
					/>
				)}
				<View style={styles.body}>
					<AppText
						variant="labelSmall"
						style={{ color: colors.mutedForeground }}
						numberOfLines={1}
					>
						{business.name}
					</AppText>
					<AppText
						variant="bodyLarge"
						weight="semiBold"
						numberOfLines={2}
						style={styles.title}
					>
						{offer.title}
					</AppText>
					<View style={styles.priceRow}>
						<AppText variant="price" style={{ color: colors.primary }}>
							{formatMoney(offer.discounted_price)}
						</AppText>
						<AppText
							variant="priceOriginal"
							style={{
								color: colors.mutedForeground,
								textDecorationLine: "line-through",
							}}
						>
							{formatMoney(offer.original_price)}
						</AppText>
						<View
							style={[
								styles.badge,
								{ backgroundColor: colors.surfaceSuccess },
							]}
						>
							<AppText
								variant="labelSmall"
								weight="bold"
								style={{ color: colors.successDark }}
							>
								{strings.offerDetail.savingsBadge.replace("{p}", String(percent))}
							</AppText>
						</View>
					</View>
				</View>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", gap: spacing.md },
	image: {
		width: 72,
		height: 72,
		borderRadius: radii.lg,
	},
	body: { flex: 1 },
	title: { marginTop: spacing.xs },
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: spacing.xs,
		flexWrap: "wrap",
	},
	badge: {
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radii.pill,
	},
});