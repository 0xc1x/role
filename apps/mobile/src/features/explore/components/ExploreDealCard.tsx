import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, HeartButton } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatDistanceKm, formatMoney, formatTime } from "@/core/utils/formatters";
import {
	discountPercentage,
	haversineKm,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import {
	useIsFavorite,
	useSelectedAddress,
	useToggleFavorite,
} from "@/features/hooks";

const LOW_STOCK_THRESHOLD = 3;

/**
 * Tarjeta de oferta vertical para la lista de Explorar (portada de DealCard/fudi):
 * imagen, badge de descuento, stock bajo, corazón, distancia y precio.
 */
export function ExploreDealCard({ offer }: { offer: OfferDetail }) {
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

	const pickupUntil = formatTime(offer.offer.pickup_end);
	const lowStock =
		offer.offer.stock > 0 && offer.offer.stock <= LOW_STOCK_THRESHOLD;

	return (
		<Pressable
			onPress={() => router.push(`/offer/${offer.offer.id}`)}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					shadowColor: colors.cardShadow,
				},
			]}
		>
			{/* ── Imagen ─────────────────────────────────────────────── */}
			<View style={styles.imageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.image}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.image, { backgroundColor: colors.surfaceMuted }]} />
				)}
				{discount > 0 ? (
					<View style={[styles.discountPill, { backgroundColor: colors.primary }]}>
						<AppText
							weight="extraBold"
							style={{ color: colors.primaryForeground, fontSize: 11 }}
						>
							-{discount}%
						</AppText>
					</View>
				) : null}
				{lowStock ? (
					<View style={[styles.lowStockPill, { backgroundColor: colors.destructiveDark }]}>
						<AppText
							weight="bold"
							style={{ color: "#FFFFFF", fontSize: 11 }}
						>
							{strings.offers.onlyLeft.replace(
								"{n}",
								String(offer.offer.stock),
							)}
						</AppText>
					</View>
				) : null}
				<View style={styles.heart}>
					<HeartButton
						isFavorite={isFavorite}
						onPress={() => toggleFavorite.mutate(offer.offer.id)}
						size={30}
						iconSize={17}
					/>
				</View>
			</View>

			{/* ── Contenido ─────────────────────────────────────────── */}
			<View style={styles.body}>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={2}
					style={{ fontSize: 15, lineHeight: 20 }}
				>
					{offer.offer.title}
				</AppText>
				<View style={styles.metaRow}>
					<Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground, fontSize: 11 }}
					>
						{[distance, offer.business.name].filter(Boolean).join(" · ")}
					</AppText>
				</View>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground, fontSize: 11 }}>
					{strings.explore.pickupBefore.replace("{time}", pickupUntil)}
				</AppText>
			</View>

			{/* ── Precio ─────────────────────────────────────────────── */}
			<View style={styles.priceColumn}>
				{offer.offer.original_price > offer.offer.discounted_price ? (
					<AppText
						variant="bodySmall"
						style={[
							styles.originalPrice,
							{ color: colors.mutedForeground, textDecorationColor: colors.mutedForeground },
						]}
					>
						{formatMoney(offer.offer.original_price)}
					</AppText>
				) : null}
				<AppText
					weight="extraBold"
					style={[styles.discountPrice, { color: colors.primary }]}
				>
					{formatMoney(offer.offer.discounted_price)}
				</AppText>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 1,
		shadowRadius: 16,
		elevation: 2,
	},
	imageWrap: {
		height: 160,
	},
	image: {
		width: "100%",
		height: "100%",
	},
	discountPill: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: radii.pill,
	},
	lowStockPill: {
		position: "absolute",
		bottom: spacing.sm,
		left: spacing.sm,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: radii.pill,
	},
	heart: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
	},
	body: {
		paddingTop: spacing.sm + 2,
		paddingHorizontal: spacing.md,
		gap: 2,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		marginTop: 4,
	},
	priceColumn: {
		alignItems: "center",
		paddingHorizontal: spacing.md,
		paddingBottom: spacing.md,
		marginTop: 6,
	},
	originalPrice: {
		fontSize: 12,
		lineHeight: 12,
		textDecorationLine: "line-through",
	},
	discountPrice: {
		fontSize: 20,
		lineHeight: 24,
		marginTop: 2,
	},
});