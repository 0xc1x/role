import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { MapPin } from "lucide-react-native";

import { useTheme } from "@/src/core/theme";
import { AppText, HeartButton } from "@/src/core/ui";
import { spacing, radii } from "@/src/core/theme/spacing";
import { strings } from "@/src/core/i18n/strings";
import {
	useIsFavorite,
	useSelectedAddress,
	useToggleFavorite,
} from "@/src/features/hooks";
import { useAuthStore } from "@/src/features/auth/store";
import { formatDistanceKm, formatTime } from "@/src/core/utils/formatters";
import {
	discountPercentage,
	haversineKm,
	type OfferDetail,
} from "@/src/features/offers/domain/offer";
import { CardPressable } from "@/components/ui/card-presable";

function dealPrice(value: number): string {
	return `$${value.toFixed(2)}`;
}

/** Card de oferta canónica (home, explorar, favoritos). */
export function OfferCard({ offer }: { offer: OfferDetail }) {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const selectedAddress = useSelectedAddress();
	const isFavorite = useIsFavorite(offer.offer.id);
	const toggleFavorite = useToggleFavorite();

	const discount = Math.round(discountPercentage(offer.offer));
	const distance =
		selectedAddress?.latitude != null &&
		selectedAddress?.longitude != null &&
		offer.location != null
			? formatDistanceKm(
					haversineKm(
						selectedAddress.latitude,
						selectedAddress.longitude,
						offer.location.latitude,
						offer.location.longitude,
					),
				)
			: "";
	const pickupTime =
		!offer.availabilityUnknown && offer.offer.pickup_end
			? formatTime(offer.offer.pickup_end)
			: "";

	return (
		<View>
			<CardPressable
				className="p-0 gap-0 border-0 shadow-none"
				style={styles.offerCard}
				onPress={() => router.push(`/offer/${offer.offer.id}`)}
			>
				{/* Imagen */}
				<View style={styles.offerImageWrap}>
					{offer.offer.image ? (
						<Image
							source={{ uri: offer.offer.image }}
							style={styles.offerImage}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.offerImage,
								{ backgroundColor: colors.borderSolid },
							]}
						/>
					)}

					{discount > 0 && (
						<View
							style={[
								styles.discountBadge,
								{ backgroundColor: colors.primary },
							]}
						>
							<AppText
								style={{
									color: colors.primaryForeground,
									fontSize: 12,
									fontWeight: "700",
								}}
							>
								-{discount}%
							</AppText>
						</View>
					)}

					{!offer.availabilityUnknown && offer.offer.stock <= 3 && (
						<View
							style={[
								styles.lowStockBadge,
								{ backgroundColor: colors.destructive },
							]}
						>
							<AppText
								variant="caption"
								style={{
									color: colors.destructiveForeground,
									fontWeight: "600",
								}}
							>
								{strings.offers.onlyLeft.replace(
									"{n}",
									String(offer.offer.stock),
								)}
							</AppText>
						</View>
					)}
				</View>

				{/* Body */}
				<View style={styles.offerBody}>
					<View style={styles.offerBodyRow}>
						<View style={styles.offerInfo}>
							<AppText
								variant="h4"
								weight="bold"
								numberOfLines={2}
								style={styles.title}
							>
								{offer.offer.title}
							</AppText>

							<View style={styles.metaBlock}>
								<View style={styles.metaRow}>
									<MapPin size={12} color={colors.mutedForeground} />
									<AppText
										numberOfLines={1}
										variant="caption"
										style={{ color: colors.mutedForeground, flex: 1 }}
									>
										{distance
											? `${distance} · ${offer.business.name}`
											: offer.business.name}
									</AppText>
								</View>

								<AppText
									variant="caption"
									numberOfLines={1}
									style={{
										color: colors.mutedForeground,
										opacity: pickupTime ? 1 : 0,
									}}
								>
									{pickupTime
										? strings.offers.pickupBefore.replace("{time}", pickupTime)
										: " "}
								</AppText>
							</View>
						</View>

						<View style={styles.offerPrice}>
							{offer.offer.original_price > 0 ? (
								<AppText
									style={{
										textDecorationLine: "line-through",
										color: colors.mutedForeground,
										fontSize: 12,
										lineHeight: 14,
									}}
								>
									{dealPrice(offer.offer.original_price)}
								</AppText>
							) : (
								<AppText style={{ fontSize: 12, lineHeight: 14, opacity: 0 }}>
									{" "}
								</AppText>
							)}
							<AppText
								variant="priceLarge"
								style={{
									color: colors.primary,
									fontSize: 20,
									lineHeight: 24,
									fontWeight: "800",
								}}
							>
								{dealPrice(offer.offer.discounted_price)}
							</AppText>
						</View>
					</View>
				</View>
			</CardPressable>

			{profile && (
				<View style={styles.heartButton}>
					<HeartButton
						isFavorite={isFavorite}
						onPress={() => toggleFavorite.mutate(offer.offer.id)}
						size={36}
						iconSize={18}
					/>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	offerCard: {
		overflow: "hidden",
	},
	offerImageWrap: {
		width: "100%",
		height: 160,
	},
	offerImage: {
		width: "100%",
		height: 160,
	},
	discountBadge: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: radii.pill,
	},
	lowStockBadge: {
		position: "absolute",
		bottom: spacing.sm,
		left: spacing.sm,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
	},
	heartButton: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
		zIndex: 1,
	},
	offerBody: {
		padding: spacing.md,
		minHeight: 96,
	},
	offerBodyRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		flex: 1,
	},
	offerInfo: {
		flex: 4,
		paddingRight: spacing.sm,
	},
	title: {
		fontSize: 15,
		lineHeight: 19,
		height: 38,
	},
	metaBlock: {
		marginTop: 6,
		gap: 2,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	offerPrice: {
		flex: 2,
		alignItems: "flex-end",
		justifyContent: "flex-end",
	},
});
