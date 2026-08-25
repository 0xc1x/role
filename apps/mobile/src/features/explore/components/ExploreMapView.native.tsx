import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatMoney, formatTime } from "@/core/utils/formatters";
import {
	discountPercentage,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import {
	exploreFilterSummary,
	type ExploreFilterState,
} from "@/features/explore/exploreTypes";
import { useCategories } from "@/features/hooks";

const ECUADOR_CENTER = {
	latitude: -1.8312,
	longitude: -78.1834,
	latitudeDelta: 12,
	longitudeDelta: 12,
} as const;

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
	const mapRef = useRef<MapView>(null);
	const { data: categories } = useCategories();

	const [region, setRegion] = useState<Region>(() => ({
		latitude: userLocation?.latitude ?? ECUADOR_CENTER.latitude,
		longitude: userLocation?.longitude ?? ECUADOR_CENTER.longitude,
		latitudeDelta: userLocation ? 0.4 : ECUADOR_CENTER.latitudeDelta,
		longitudeDelta: userLocation ? 0.4 : ECUADOR_CENTER.longitudeDelta,
	}));
	const [mapReady, setMapReady] = useState(false);
	const [hasFitted, setHasFitted] = useState(false);
	const [selectedOffer, setSelectedOffer] = useState<OfferDetail | null>(null);

	const locatedOffers = offers.filter((o) => o.location != null);
	const hasOffers = locatedOffers.length > 0;

	const filterParts = exploreFilterSummary(
		filters,
		filters.category != null
			? categories?.find((c) => c.id === filters.category)?.name ??
				filters.category
			: undefined,
	);

	// Fit a las ofertas una sola vez cuando aparecen.
	useEffect(() => {
		if (!mapReady || hasFitted || locatedOffers.length === 0) return;
		setHasFitted(true);
		const coords = locatedOffers.slice(0, 20).map((o) => ({
			latitude: o.location!.latitude,
			longitude: o.location!.longitude,
		}));
		mapRef.current?.fitToCoordinates(coords, {
			edgePadding: { top: 120, right: 48, bottom: 120, left: 48 },
			animated: true,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mapReady, hasFitted, offers]);

	// Deseleccionar al tocar el mapa.
	const handleMapPress = () => setSelectedOffer(null);

	const zoomIn = () => {
		setRegion((r) => ({
			...r,
			latitudeDelta: Math.max(r.latitudeDelta / 2, 0.001),
			longitudeDelta: Math.max(r.longitudeDelta / 2, 0.001),
		}));
	};

	const zoomOut = () => {
		setRegion((r) => ({
			...r,
			latitudeDelta: Math.min(r.latitudeDelta * 2, 120),
			longitudeDelta: Math.min(r.longitudeDelta * 2, 120),
		}));
	};

	const goToMyLocation = async () => {
		if (userLocation) {
			setRegion({
				latitude: userLocation.latitude,
				longitude: userLocation.longitude,
				latitudeDelta: 0.02,
				longitudeDelta: 0.02,
			});
			return;
		}
		try {
			const pos = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});
			setRegion({
				latitude: pos.coords.latitude,
				longitude: pos.coords.longitude,
				latitudeDelta: 0.02,
				longitudeDelta: 0.02,
			});
		} catch {
			// Ubicación no disponible — silencioso.
		}
	};

	return (
		<View style={styles.flex}>
			<MapView
				ref={mapRef}
				style={StyleSheet.absoluteFill}
				region={region}
				onRegionChangeComplete={setRegion}
				onMapReady={() => setMapReady(true)}
				showsUserLocation={!!userLocation}
				showsMyLocationButton={false}
				zoomTapEnabled={false}
				pitchEnabled={false}
				rotateEnabled={false}
				onPress={handleMapPress}
			>
				{locatedOffers.map((offer) => {
					const selected = selectedOffer?.offer.id === offer.offer.id;
					return (
						<Marker
							key={`${offer.offer.id}-${selected ? "sel" : "def"}`}
							coordinate={{
								latitude: offer.location!.latitude,
								longitude: offer.location!.longitude,
							}}
							onPress={() => setSelectedOffer(offer)}
							tracksViewChanges={false}
							anchor={{ x: 0.5, y: 1 }}
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
						</Marker>
					);
				})}
			</MapView>

			{/* ── Header ─────────────────────────────────────────────── */}
			<View style={[styles.header, { top: spacing.md }]}>
				<View
					style={[styles.headerCard, { backgroundColor: colors.card, boxShadow: `0px 2px 8px ${colors.shadow}` }]}
				>
					<Pressable
						onPress={onBack}
						accessibilityRole="button"
						accessibilityLabel={strings.common.back}
						style={[styles.headerButton, { backgroundColor: colors.surfaceMuted }]}
					>
						<Ionicons name="chevron-back" size={22} color={colors.foreground} />
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
								backgroundColor: filters.category != null || filters.maxDistanceKm != null || filters.maxPrice != null
									? colors.primary + "1A"
									: colors.surfaceMuted,
								borderWidth: filters.category != null || filters.maxDistanceKm != null || filters.maxPrice != null ? 1.5 : 0,
								borderColor: colors.primary,
							},
						]}
					>
						<Ionicons
							name="options-outline"
							size={20}
							color={
								filters.category != null || filters.maxDistanceKm != null || filters.maxPrice != null
									? colors.primary
									: colors.mutedForeground
							}
						/>
					</Pressable>
				</View>
			</View>

			{/* ── Controles de zoom + mi ubicación ─────────────────────── */}
			<View style={[styles.zoomControls, { top: 96, backgroundColor: colors.card, boxShadow: `0px 2px 8px ${colors.shadow}` }]}>
				<Pressable onPress={zoomIn} style={styles.zoomButton} accessibilityRole="button" accessibilityLabel="zoom in">
					<Ionicons name="add" size={20} color={colors.foreground} />
				</Pressable>
				<View style={[styles.zoomDivider, { backgroundColor: colors.border }]} />
				<Pressable onPress={zoomOut} style={styles.zoomButton} accessibilityRole="button" accessibilityLabel="zoom out">
					<Ionicons name="remove" size={20} color={colors.foreground} />
				</Pressable>
			</View>
			<View style={[styles.myLocation, { bottom: selectedOffer ? 360 : 80, backgroundColor: colors.card, boxShadow: `0px 2px 8px ${colors.shadow}` }]}>
				<Pressable onPress={() => void goToMyLocation()} accessibilityRole="button" accessibilityLabel={strings.explore.myLocation}>
					<Ionicons name="locate" size={22} color={colors.primary} />
				</Pressable>
			</View>

			{/* ── Estados ─────────────────────────────────────────────── */}
			{!mapReady ? (
				<View style={styles.centerOverlay}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : null}
			{mapReady && !hasOffers ? (
				<View style={[styles.noOffers, { top: 116 }]}>
					<View style={[styles.noOffersCard, { backgroundColor: colors.card }]}>
						<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
							{strings.explore.noOffersInZone}
						</AppText>
					</View>
				</View>
			) : null}

			{/* ── Card de oferta seleccionada ─────────────────────────── */}
			{selectedOffer ? (
				<MapOfferCard
					offer={selectedOffer}
					onClose={() => setSelectedOffer(null)}
				/>
			) : null}

			{/* ── Leyenda ─────────────────────────────────────────────── */}
			{!selectedOffer ? (
				<View style={[styles.legend, { bottom: 24, backgroundColor: colors.card }]}>
					<View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
					<AppText variant="bodySmall">
						{strings.explore.offersAvailable}
					</AppText>
				</View>
			) : null}
		</View>
	);
}

function MapOfferCard({
	offer,
	onClose,
}: {
	offer: OfferDetail;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const discount = Math.round(discountPercentage(offer.offer));
	const hasRating = (offer.business.rating ?? 0) > 0;

	return (
		<View style={[styles.selectedCard, { backgroundColor: colors.card, boxShadow: `0px 4px 16px ${colors.shadow}` }]}>
			<View style={styles.selectedImageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.selectedImage}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.selectedImage, { backgroundColor: colors.surfaceMuted }]} />
				)}
				{discount > 0 ? (
					<View style={[styles.selectedDiscount, { backgroundColor: colors.primary }]}>
						<AppText
							weight="extraBold"
							style={{ color: colors.primaryForeground, fontSize: 12 }}
						>
							-{discount}%
						</AppText>
					</View>
				) : null}
				<Pressable onPress={onClose} style={[styles.selectedClose, { backgroundColor: colors.card }]}>
					<Ionicons name="close" size={16} color={colors.foreground} />
				</Pressable>
				<LinearGradient
					colors={["transparent", "rgba(0,0,0,0.4)"]}
					style={styles.selectedFade}
				/>
			</View>
			<View style={styles.selectedBody}>
				<AppText variant="labelSmall" weight="bold" numberOfLines={1}>
					{offer.offer.title}
				</AppText>
				<View style={styles.selectedMeta}>
					<Ionicons name="storefront-outline" size={14} color={colors.mutedForeground} />
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground, flex: 1 }}
					>
						{offer.business.name}
					</AppText>
					{hasRating ? (
						<>
							<Ionicons name="star" size={14} color={colors.starGold} />
							<AppText
								variant="bodySmall"
								weight="semiBold"
								style={{ color: colors.starGold }}
							>
								{(offer.business.rating ?? 0).toFixed(1)}
							</AppText>
						</>
					) : null}
				</View>
				<View style={styles.selectedMeta}>
					<Ionicons name="time-outline" size={14} color={colors.info} />
					<AppText variant="bodySmall" weight="semiBold" style={{ color: colors.info }}>
						{strings.explore.pickupWindow
							.replace("{start}", formatTime(offer.offer.pickup_start))
							.replace("{end}", formatTime(offer.offer.pickup_end))}
					</AppText>
				</View>
				<View style={styles.selectedPriceRow}>
					<AppText weight="extraBold" style={{ color: colors.primary, fontSize: 20 }}>
						{formatMoney(offer.offer.discounted_price)}
					</AppText>
					{offer.offer.original_price > offer.offer.discounted_price ? (
						<AppText
							variant="bodySmall"
							style={{ textDecorationLine: "line-through", color: colors.mutedForeground }}
						>
							{formatMoney(offer.offer.original_price)}
						</AppText>
					) : null}
					<AppText
						variant="bodySmall"
						style={{
							marginLeft: "auto",
							color: offer.offer.stock <= 3 ? colors.destructive : colors.mutedForeground,
							fontWeight: offer.offer.stock <= 3 ? "700" : "400",
						}}
					>
						{strings.explore.availableCount.replace(
							"{n}",
							String(offer.offer.stock),
						)}
					</AppText>
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
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		paddingHorizontal: spacing.md,
		gap: 2,
	},
	zoomControls: {
		position: "absolute",
		right: spacing.lg,
		borderRadius: radii.lg,
		overflow: "hidden",
	},
	zoomButton: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	zoomDivider: {
		height: 1,
	},
	myLocation: {
		position: "absolute",
		right: spacing.lg,
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	centerOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
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
		borderRadius: 6,
	},
	pricePill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: radii.pill,
		borderWidth: 2,
		alignItems: "center",
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
		borderRadius: 14,
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