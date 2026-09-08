import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { withAlpha } from "@/core/theme/alpha";
import { formatMoneyPrecise } from "@/core/utils/formatters";
import type { OfferDetail } from "@/features/offers/domain/offer";

const BOTTOM_BAR_HEIGHT = 92;

export function OfferBottomBar({
	detail,
	available,
	outOfStock,
	bottomOffset,
}: {
	detail: OfferDetail;
	available: boolean;
	outOfStock: boolean;
	bottomOffset: number;
}) {
	const { colors } = useTheme();
	const muted = colors.mutedForeground;
	return (
		<View style={[styles.bottomBarWrap, { bottom: bottomOffset }]}>
			<View style={[styles.bottomBar, { backgroundColor: colors.card, boxShadow: `0px 8px 24px ${colors.shadow}` }]}>
				<View>
					<AppText
						style={{
							textDecorationLine: "line-through",
							color: muted,
							fontSize: 12,
						}}
					>
						{formatMoneyPrecise(detail.offer.original_price)}
					</AppText>
					<AppText variant="h3" weight="extraBold">
						{formatMoneyPrecise(detail.offer.discounted_price)}
					</AppText>
				</View>
				<Pressable
					disabled={!available}
					onPress={() => router.push(`/checkout/${detail.offer.id}`)}
					style={({ pressed }) => [
						styles.saveButton,
						{
							backgroundColor: available
								? colors.primary
								: `${withAlpha(colors.foreground, 0.149)}`,
							transform: [{ scale: pressed ? 0.97 : 1 }],
						},
					]}
				>
					<AppText
						weight="bold"
						style={{ color: colors.primaryForeground }}
					>
						{outOfStock
							? strings.offers.soldOut
							: strings.offerDetail.savePack}
					</AppText>
				</Pressable>
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
		padding: 16,
		borderRadius: 24,
		minHeight: BOTTOM_BAR_HEIGHT,
	},
	saveButton: {
		height: 52,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
});
