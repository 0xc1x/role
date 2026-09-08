import { View, StyleSheet, Image, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/core/theme";
import { AppText, Card, HeartButton } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";
import { useIsFavorite, useSelectedAddress, useToggleFavorite } from "@/features/hooks";
import { useAuthStore } from "@/features/auth/store";
import { formatDistanceKm, formatTime } from "@/core/utils/formatters";
import {
	discountPercentage,
	haversineKm,
	type OfferDetail,
} from "@/features/offers/domain/offer";

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
	const pickupTime = offer.offer.pickup_end
		? formatTime(offer.offer.pickup_end)
		: "";

return (
		<View style={styles.wrapper}>
			<Card
				style={styles.offerCard}
				onPress={() => router.push(`/offer/${offer.offer.id}`)}
			>
				{/* Imagen */}
				<View style={styles.offerImageWrap}>
					{offer.offer.image ? (
						<Image
							source={{ uri: offer.offer.image }}
							style={styles.offerImage}
							resizeMode="cover"
						/>
					) : (
						<View
							style={[styles.offerImage, { backgroundColor: colors.borderSolid }]}
						/>
					)}

					{discount > 0 && (
						<View
							style={[styles.discountBadge, { backgroundColor: colors.primary }]}
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

					{offer.offer.stock <= 3 && (
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

				{/* Body con altura fija de contenido */}
				<View style={styles.offerBody}>
					<View style={styles.offerBodyRow}>
						<View style={styles.offerInfo}>
							{/* Título siempre 2 líneas → altura constante */}
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
									<Ionicons
										name="location-outline"
										size={12}
										color={colors.mutedForeground}
									/>
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

								{/* Reserva espacio aunque no haya pickupTime */}
								<AppText
									variant="caption"
									style={{
										color: colors.mutedForeground,
										opacity: pickupTime ? 1 : 0,
									}}
									numberOfLines={1}
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
								// Reserva espacio del precio tachado
								<AppText style={{ fontSize: 12, lineHeight: 14, opacity: 0 }}>
									{" "}
								</AppText>
							)}
							<AppText
								variant="priceLarge"
								style={{
									color: colors.primary,
									fontSize: 25,
									lineHeight: 24,
									fontWeight: "800",
								}}
							>
								{dealPrice(offer.offer.discounted_price)}
							</AppText>
						</View>
					</View>
				</View>
			</Card>

			{/* Hermano absoluto: evita <button> anidado en web */}
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
	wrapper: {
		flex: 1,
	},
	offerCard: {
		padding: 0,
		overflow: "hidden",
		borderRadius: radii.xl,
		borderWidth: 0,
		flex: 1,
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