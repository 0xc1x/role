import { memo, useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { ChevronLeft, SlidersHorizontal, Store, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatMoney } from "@/src/core/utils/formatters";
import {
	discountPercentage,
	type OfferDetail,
} from "@/src/features/offers/domain/offer";
import {
	exploreFilterSummary,
	type ExploreFilterState,
} from "@/src/features/explore/exploreTypes";
import { useCategories } from "@/src/features/hooks";
import { env } from "@/src/core/config/env";
// Static import: this file is web-only.
import { MapCanvas } from "@/src/core/ui/MapCanvas.web";

const FALLBACK_COORD = { latitude: -1.8312, longitude: -78.1834 };

/**
 * Mapa de Explorar (web): mismo Google Maps interactivo que el picker de
 * ubicación, con pines de precio por oferta. En nativo se usa react-native-maps
 * (archivo .native.tsx).
 */
export function ExploreMapView({
	offers,
	filters,
	userLocation,
	onBack,
	onFilterTap,
}: {
	offers: OfferDetail[];
	filters: ExploreFilterState;
	userLocation: { latitude: number; longitude: number } | null;
	onBack: () => void;
	onFilterTap: () => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { data: categories } = useCategories();
	const [selectedOffer, setSelectedOffer] = useState<OfferDetail | null>(null);
	const handleSelectOffer = useCallback(
		(offer: OfferDetail) => setSelectedOffer(offer),
		[],
	);
	const handleCloseCard = useCallback(() => setSelectedOffer(null), []);

	const locatedOffers = offers.filter((o) => o.location != null);
	const hasOffers = locatedOffers.length > 0;

	const firstLocated = locatedOffers[0];
	const center =
		userLocation ??
		(firstLocated?.location
			? {
					latitude: firstLocated.location.latitude,
					longitude: firstLocated.location.longitude,
				}
			: FALLBACK_COORD);

	const filterParts = exploreFilterSummary(
		filters,
		filters.category != null
			? (categories?.find((c) => c.id === filters.category)?.name ??
					filters.category)
			: undefined,
	);

	return (
		<View style={styles.flex}>
			{env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? (
				<MapCanvas
					coords={center}
					fullscreen
					centerPin={false}
					onRegionChange={() => {}}
					fitCoords={locatedOffers.slice(0, 20).flatMap((o) =>
						o.location != null
							? [
									{
										latitude: o.location.latitude,
										longitude: o.location.longitude,
									},
								]
							: [],
					)}
				>
					{locatedOffers.map((offer) => (
						<OfferPriceMarker
							key={offer.offer.id}
							offer={offer}
							selected={selectedOffer?.offer.id === offer.offer.id}
							onSelect={handleSelectOffer}
						/>
					))}
				</MapCanvas>
			) : (
				<View style={[styles.flex, { backgroundColor: colors.borderSolid }]} />
			)}

			{/* ── Header ─────────────────────────────────────────────── */}
			<View style={[styles.header, { top: insets.top + spacing.sm }]}>
				<View
					style={[
						styles.headerCard,
						{
							backgroundColor: colors.card,
							boxShadow: `0px 2px 8px ${colors.shadow}`,
						},
					]}
				>
					<Pressable
						onPress={onBack}
						accessibilityRole="button"
						accessibilityLabel={strings.common.back}
						style={[
							styles.headerButton,
							{ backgroundColor: colors.surfaceMuted },
						]}
					>
						<ChevronLeft size={22} color={colors.foreground} />
					</Pressable>
					<View style={styles.headerTitle}>
						<AppText variant="labelSmall" weight="semiBold">
							{strings.explore.mapOfOffers}
						</AppText>
						{filterParts.length > 0 ? (
							<AppText
								variant="bodySmall"
								numberOfLines={1}
								style={{ color: colors.mutedForeground }}
							>
								{filterParts.join(" · ")}
							</AppText>
						) : null}
					</View>
					<Pressable
						onPress={onFilterTap}
						accessibilityRole="button"
						accessibilityLabel={strings.explore.filters}
						style={[
							styles.headerButton,
							{
								backgroundColor:
									filters.category != null ||
									filters.maxDistanceKm != null ||
									filters.maxPrice != null
										? withAlpha(colors.primary, 0.102)
										: colors.surfaceMuted,
								borderWidth:
									filters.category != null ||
									filters.maxDistanceKm != null ||
									filters.maxPrice != null
										? 1.5
										: 0,
								borderColor: colors.primary,
							},
						]}
					>
						<SlidersHorizontal
							size={20}
							color={
								filters.category != null ||
								filters.maxDistanceKm != null ||
								filters.maxPrice != null
									? colors.primary
									: colors.mutedForeground
							}
						/>
					</Pressable>
				</View>
			</View>

			{/* ── Estados ────────────────────────────────────────────── */}
			{!hasOffers ? (
				<View style={[styles.noOffers, { top: 116 }]}>
					<View style={[styles.noOffersCard, { backgroundColor: colors.card }]}>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.explore.noOffersInZone}
						</AppText>
					</View>
				</View>
			) : null}

			{/* ── Card de oferta seleccionada / leyenda ──────────────── */}
			{selectedOffer ? (
				<MapOfferCard offer={selectedOffer} onClose={handleCloseCard} />
			) : (
				<View
					style={[styles.legend, { bottom: 24, backgroundColor: colors.card }]}
				>
					<View
						style={[styles.legendDot, { backgroundColor: colors.primary }]}
					/>
					<AppText variant="bodySmall">
						{strings.explore.offersAvailable}
					</AppText>
				</View>
			)}
		</View>
	);
}

const OfferPriceMarker = memo(function OfferPriceMarker({
	offer,
	selected,
	onSelect,
}: {
	offer: OfferDetail;
	selected: boolean;
	onSelect: (offer: OfferDetail) => void;
}) {
	const { colors } = useTheme();
	const loc = offer.location;
	const handlePress = useCallback(() => onSelect(offer), [onSelect, offer]);
	if (loc == null) return null;
	return (
		<AdvancedMarker
			key={offer.offer.id}
			position={{ lat: loc.latitude, lng: loc.longitude }}
			onClick={handlePress}
		>
			<View
				style={[
					styles.pricePill,
					selected
						? { backgroundColor: colors.primary, borderColor: colors.primary }
						: { backgroundColor: colors.card, borderColor: colors.primary },
				]}
			>
				<AppText
					weight="extraBold"
					style={{
						color: selected ? colors.primaryForeground : colors.primary,
						fontSize: 12,
					}}
				>
					{formatMoney(offer.offer.discounted_price)}
				</AppText>
			</View>
		</AdvancedMarker>
	);
});

function MapOfferCard({
	offer,
	onClose,
}: {
	offer: OfferDetail;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const discount = Math.round(discountPercentage(offer.offer));

	return (
		<View
			style={[
				styles.selectedCard,
				{
					backgroundColor: colors.card,
					boxShadow: `0px 4px 16px ${colors.shadow}`,
				},
			]}
		>
			<View style={styles.selectedImageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.selectedImage}
						resizeMode="cover"
					/>
				) : (
					<View
						style={[
							styles.selectedImage,
							{ backgroundColor: colors.surfaceMuted },
						]}
					/>
				)}
				{discount > 0 ? (
					<View
						style={[
							styles.selectedDiscount,
							{ backgroundColor: colors.primary },
						]}
					>
						<AppText
							weight="extraBold"
							style={{ color: colors.primaryForeground, fontSize: 12 }}
						>
							-{discount}%
						</AppText>
					</View>
				) : null}
				<Pressable
					onPress={onClose}
					style={[styles.selectedClose, { backgroundColor: colors.card }]}
				>
					<X size={16} color={colors.foreground} />
				</Pressable>
				<LinearGradient
					colors={["transparent", withAlpha(colors.scrim, 0.4)]}
					style={styles.selectedFade}
				/>
			</View>
			<View style={styles.selectedBody}>
				<AppText variant="labelSmall" weight="bold" numberOfLines={1}>
					{offer.offer.title}
				</AppText>
				<View style={styles.selectedMeta}>
					<Store size={14} color={colors.mutedForeground} />
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground, flex: 1 }}
					>
						{offer.business.name}
					</AppText>
					<AppText
						variant="bodySmall"
						style={{
							color:
								offer.offer.stock <= 3
									? colors.destructive
									: colors.mutedForeground,
						}}
					>
						{strings.explore.availableCount.replace(
							"{n}",
							String(offer.offer.stock),
						)}
					</AppText>
				</View>
				<View style={styles.selectedPriceRow}>
					<AppText
						weight="extraBold"
						style={{ color: colors.primary, fontSize: 20 }}
					>
						{formatMoney(offer.offer.discounted_price)}
					</AppText>
					{offer.offer.original_price > offer.offer.discounted_price ? (
						<AppText
							variant="bodySmall"
							style={{
								textDecorationLine: "line-through",
								color: colors.mutedForeground,
							}}
						>
							{formatMoney(offer.offer.original_price)}
						</AppText>
					) : null}
				</View>
			</View>
			<Pressable
				onPress={() => router.push(`/offer/${offer.offer.id}`)}
				style={[styles.detailButton, { backgroundColor: colors.primary }]}
			>
				<AppText weight="bold" style={{ color: colors.primaryForeground }}>
					{strings.explore.viewDetail}
				</AppText>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	pricePill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: radii.pill,
		borderWidth: 2,
		alignItems: "center",
		marginBottom: 12,
	},
	header: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
	},
	headerCard: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.lg,
	},
	headerButton: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		paddingHorizontal: spacing.md,
		gap: 2,
	},
	noOffers: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		alignItems: "center",
	},
	noOffersCard: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
	},
	legend: {
		position: "absolute",
		left: spacing.lg,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.md,
		paddingVertical: 10,
		borderRadius: radii.lg,
	},
	legendDot: {
		width: 12,
		height: 12,
		borderRadius: radii.sm,
	},
	selectedCard: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		bottom: spacing.md,
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	selectedImageWrap: {
		height: 140,
	},
	selectedImage: {
		width: "100%",
		height: "100%",
	},
	selectedDiscount: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: radii.pill,
	},
	selectedClose: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		width: 28,
		height: 28,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	selectedFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 60,
	},
	selectedBody: {
		paddingHorizontal: spacing.md,
		paddingTop: spacing.sm,
		gap: spacing.xs,
	},
	selectedMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	selectedPriceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	detailButton: {
		margin: spacing.md,
		marginTop: spacing.sm,
		height: 46,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
});
