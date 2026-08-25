import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatDistanceKm, formatMoney } from "@/core/utils/formatters";
import {
	discountPercentage,
	haversineKm,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import { useSelectedAddress, useIsFavorite, useToggleFavorite } from "@/features/hooks";

export function OfferGridCard({ offer }: { offer: OfferDetail }) {
	const { colors } = useTheme();
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

	return (
		<Pressable
			onPress={() => router.push(`/offer/${offer.offer.id}`)}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					boxShadow: `0px 6px 16px ${colors.cardShadow}`,
				},
			]}
		>
			<View style={styles.imageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.image}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.image, styles.imagePlaceholder]} />
				)}
				{discount >= 10 ? (
					<View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
						<AppText
							style={{
								color: colors.primaryForeground,
								fontSize: 11,
								fontWeight: "700",
							}}
						>
							-{discount}%
						</AppText>
					</View>
				) : null}
				{offer.offer.stock <= 3 && offer.offer.stock > 0 ? (
					<View
						style={[styles.lowStockBadge, { backgroundColor: colors.destructive }]}
					>
						<AppText
							style={{
								color: "#FFFFFF",
								fontSize: 10,
								fontWeight: "600",
							}}
						>
							{strings.offers.onlyLeft.replace(
								"{n}",
								String(offer.offer.stock),
							)}
						</AppText>
					</View>
				) : null}
				<Pressable
					onPress={() => toggleFavorite.mutate(offer.offer.id)}
					hitSlop={6}
					style={[styles.heart, { backgroundColor: colors.card }]}
				>
					<Ionicons
						name={isFavorite ? "heart" : "heart-outline"}
						size={16}
						color={
							isFavorite ? colors.destructiveVibrant : colors.mutedForeground
						}
					/>
				</Pressable>
			</View>
			<View style={styles.body}>
				<AppText
					variant="labelSmall"
					weight="semiBold"
					numberOfLines={1}
					style={{ color: colors.mutedForeground, fontSize: 12 }}
				>
					{offer.business.name}
				</AppText>
				<AppText
					variant="bodySmall"
					numberOfLines={1}
					style={{ color: colors.mutedForeground, fontSize: 11 }}
				>
					{offer.offer.title}
				</AppText>
				<View style={styles.priceRow}>
					<AppText variant="price" style={{ color: colors.primary, fontSize: 16 }}>
						{formatMoney(offer.offer.discounted_price)}
					</AppText>
					<AppText
						variant="priceOriginal"
						style={{ color: colors.mutedForeground, fontSize: 11 }}
					>
						{formatMoney(offer.offer.original_price)}
					</AppText>
				</View>
				{distance ? (
					<View style={styles.distanceRow}>
						<Ionicons name="location-outline" size={10} color={colors.mutedForeground} />
						<AppText style={{ color: colors.mutedForeground, fontSize: 10 }}>
							{distance}
						</AppText>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	imageWrap: {
		aspectRatio: 1.25,
	},
	image: {
		width: "100%",
		height: "100%",
	},
	imagePlaceholder: {
		backgroundColor: "#E5E5E5",
	},
	discountBadge: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: radii.sm,
	},
	lowStockBadge: {
		position: "absolute",
		bottom: spacing.sm,
		left: spacing.sm,
		right: spacing.sm,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: radii.sm,
	},
	heart: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	body: {
		padding: spacing.sm,
		gap: 2,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 4,
		marginTop: 2,
	},
	distanceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		marginTop: 2,
	},
});