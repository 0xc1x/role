import { StyleSheet, View, Platform } from "react-native";
import { router } from "expo-router";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatMoneyPrecise } from "@/src/core/utils/formatters";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { radii, spacing } from "@/src/core/theme/spacing";
import { Button } from "@/components/ui/button";

const BOTTOM_BAR_HEIGHT = 92;

export function OfferBottomBar({
	detail,
	available,
	outOfStock,
	bottomOffset,
	availabilityUnknown = false,
}: {
	detail: OfferDetail;
	available: boolean;
	outOfStock: boolean;
	bottomOffset: number;
	availabilityUnknown?: boolean;
}) {
	const { colors } = useTheme();
	const muted = colors.mutedForeground;
	const purchasable = available && !availabilityUnknown;
	return (
		<View style={[styles.bottomBarWrap, { bottom: bottomOffset }]}>
			<View
				style={[
					styles.bottomBar,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
						boxShadow: Platform.select({
							ios: `0px 8px 24px ${withAlpha(colors.shadow, 0.18)}`,
							default: `0px 8px 24px ${colors.shadow}`,
						}),
					},
				]}
			>
				<View style={styles.priceRow}>
					<AppText variant="h3" weight="extraBold">
						{formatMoneyPrecise(detail.offer.discounted_price)}
					</AppText>
					<AppText
						style={{
							textDecorationLine: "line-through",
							color: muted,
							fontSize: 13,
						}}
					>
						{formatMoneyPrecise(detail.offer.original_price)}
					</AppText>
				</View>
				<Button
					disabled={!purchasable}
					onPress={() => router.push(`/checkout/${detail.offer.id}`)}
				>
					<AppText
						weight="bold"
						style={{ color: colors.primaryForeground }}
					>
						{availabilityUnknown
							? strings.offers.unavailable
							: outOfStock
								? strings.offers.soldOut
								: strings.offerDetail.savePack}
					</AppText>
				</Button>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bottomBarWrap: {
		position: "absolute",
		left: 16,
		right: 16,
	},
	bottomBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		borderWidth: 1,
		borderRadius: radii.md,
		minHeight: BOTTOM_BAR_HEIGHT - 20,

	},
	priceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: spacing.md,
	},
	saveButton: {
		height: 52,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
});