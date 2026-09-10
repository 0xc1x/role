import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, HeartButton } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
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
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					boxShadow: `0px 6px 16px ${colors.cardShadow}`,
				},
			]}
		>
			<Pressable
				onPress={() => router.push(`/offer/${offer.offer.id}`)}
				style={styles.pressArea}
			>
			<View style={styles.imageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.image}
						contentFit="cover"
					/>
				) : (
					<View style={[styles.image, { backgroundColor: colors.borderSolid }]} />
				)}
				{discount >= 10 ? (
					<View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
						<AppText
							variant="caption"
							weight="bold"
							style={{
								color: colors.primaryForeground,
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
							variant="tiny"
							weight="semiBold"
							style={{
								color: colors.destructiveForeground,
							}}
						>
							{strings.offers.onlyLeft.replace(
								"{n}",
								String(offer.offer.stock),
							)}
						</AppText>
					</View>
				) : null}
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
					variant="caption"
					numberOfLines={1}
					style={{ color: colors.mutedForeground }}
				>
					{offer.offer.title}
				</AppText>
				<View style={styles.priceRow}>
					<AppText variant="price" style={{ color: colors.primary, fontSize: 16 }}>
						{formatMoney(offer.offer.discounted_price)}
					</AppText>
					<AppText
						variant="caption"
						style={{ color: colors.mutedForeground }}
					>
						{formatMoney(offer.offer.original_price)}
					</AppText>
				</View>
				{distance ? (
					<View style={styles.distanceRow}>
						<Ionicons name="location-outline" size={10} color={colors.mutedForeground} />
						<AppText variant="tiny" style={{ color: colors.mutedForeground }}>
							{distance}
						</AppText>
					</View>
				) : null}
			</View>
			</Pressable>
			{/* Hermano absoluto: evita <button> anidado en web */}
			<View style={styles.heart}>
				<HeartButton
					isFavorite={isFavorite}
					onPress={() => toggleFavorite.mutate(offer.offer.id)}
					size={30}
					iconSize={16}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	pressArea: {
		flex: 1,
	},
	imageWrap: {
		aspectRatio: 1.25,
	},
	image: {
		width: "100%",
		height: "100%",
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
		zIndex: 1,
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