import { useRef, type ReactNode } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Animated,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, CircleIconButton, HeartButton } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	useOffer,
	useIsFavorite,
	useToggleFavorite,
	useSelectedAddress,
} from "@/features/hooks";
import {
	discountPercentage,
	isOfferAvailable,
	isOfferOutOfStock,
	haversineKm,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import {
	formatMoneyPrecise,
	formatDistanceKm,
	formatTime,
} from "@/core/utils/formatters";

const HERO_HEIGHT = 320;
const BOTTOM_BAR_HEIGHT = 92;

export default function OfferDetailScreen() {
	const { colors, scheme } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const offerId = id ?? "";
	const { data, isLoading, isError, error, refetch } = useOffer(offerId);
	const isFavorite = useIsFavorite(offerId);
	const toggleFavorite = useToggleFavorite();
	const selectedAddress = useSelectedAddress();

	const scrollY = useRef(new Animated.Value(0)).current;
	const headerHeight = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [HERO_HEIGHT, 0],
		extrapolateRight: "clamp",
	});
	const headerOpacity = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [1, 0],
		extrapolateRight: "clamp",
	});

	if (isLoading) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	if (isError || !data) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<Ionicons
					name="alert-circle-outline"
					size={64}
					color={colors.mutedForeground}
				/>
				<AppText variant="h3" weight="bold" style={{ marginTop: spacing.md }}>
					{error instanceof Error ? error.message : strings.common.error}
				</AppText>
				<Pressable onPress={() => void refetch()}>
					<View
						style={[
							styles.retryPill,
							{ backgroundColor: colors.foreground },
						]}
					>
						<AppText style={{ color: colors.background }}>
							{strings.common.retry}
						</AppText>
					</View>
				</Pressable>
			</View>
		);
	}

	const savings = Math.round(discountPercentage(data.offer));
	const outOfStock = isOfferOutOfStock(data);
	const available = isOfferAvailable(data);
	const isDark = scheme === "dark";
	const cardBg = isDark ? colors.card : colors.background;
	const muted = colors.mutedForeground;
	const border = colors.borderSolid;

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={{ paddingBottom: 140 }}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					{ useNativeDriver: false },
				)}
				showsVerticalScrollIndicator={false}
			>
				<View style={{ height: HERO_HEIGHT }} />

				<View style={styles.content}>
					{/* ── Categorías + rating ─────────────────────────────── */}
					<View style={styles.categoryRow}>
						<View style={styles.categoryWrap}>
							{data.categories.length > 0
								? data.categories.map((c) => (
										<CategoryBadge key={c.id} label={c.name} />
									))
								: <CategoryBadge label={data.business.type} />}
						</View>
						{data.offer.rating > 0 ? (
							<View style={styles.ratingRow}>
								<Ionicons name="star" size={18} color={colors.yellow} />
								<AppText variant="bodyMedium" weight="bold">
									{data.offer.rating.toFixed(1)}
								</AppText>
								<AppText
									variant="bodySmall"
									style={{ color: muted }}
								>
									({data.offer.review_count})
								</AppText>
							</View>
						) : null}
					</View>

					{/* ── Nombre del negocio ──────────────────────────────── */}
					<AppText
						variant="h4"
						weight="extraBold"
						style={{ letterSpacing: -0.8, marginTop: spacing.sm }}
					>
						{data.business.name}
					</AppText>

					{/* ── Badges activos: ahorro + stock bajo ─────────────── */}
					<View style={styles.badgeWrap}>
						<View
							style={[styles.pill, { backgroundColor: colors.foreground }]}
						>
							<AppText
								weight="bold"
								style={{ color: colors.background, fontSize: 12 }}
							>
								{strings.offerDetail.savingsBadge.replace(
									"{p}",
									String(savings),
								)}
							</AppText>
						</View>
						{data.offer.stock <= 3 && data.offer.stock > 0 ? (
							<View
								style={[
									styles.pill,
									styles.onlyLeftPill,
									{
										backgroundColor: `${colors.destructive}1F`,
										borderColor: `${colors.destructive}4D`,
									},
								]}
							>
								<AppText
									weight="bold"
									style={{ color: colors.destructive, fontSize: 12 }}
								>
									{strings.offerDetail.onlyLeftBadge.replace(
										"{n}",
										String(data.offer.stock),
									)}
								</AppText>
							</View>
						) : null}
					</View>

					{/* ── Timeline ────────────────────────────────────────── */}
					<TimelineStep
						icon="storefront-outline"
						title={strings.offerDetail.establishment}
						subtitle={data.business.name}
						trailing={
							<Pressable
								onPress={() =>
									router.push(`/business-profile/${data.offer.business_id}`)
								}
							>
								<View
									style={[
										styles.seeLocalPill,
										{ backgroundColor: `${colors.primary}1A` },
									]}
								>
									<AppText
										weight="bold"
										style={{ color: colors.primary, fontSize: 12 }}
									>
										{strings.offerDetail.seeLocal}
									</AppText>
								</View>
							</Pressable>
						}
					/>
					<TimelineDivider border={border} />

					<TimelineStep
						icon="location-outline"
						title={strings.offerDetail.locationStep}
						subtitle={distanceSubtitle(data, selectedAddress)}
					/>
					<TimelineDivider border={border} />

					<TimelineStep
						icon="time-outline"
						title={strings.offerDetail.pickupSchedule}
						subtitle={strings.offerDetail.pickupWindowText
							.replace("{start}", formatTime(data.offer.pickup_start))
							.replace("{end}", formatTime(data.offer.pickup_end))}
					/>
					<TimelineDivider border={border} />

					<TimelineStep
						icon="cube-outline"
						title={strings.offerDetail.availablePacks}
						subtitle={strings.offerDetail.packsLeftText
							.replace("{stock}", String(data.offer.stock))
							.replace(
								"{initial}",
								String(data.offer.initial_stock || data.offer.stock),
							)}
					/>
					<TimelineDivider border={border} />

					<TimelineStep
						icon="checkmark-circle-outline"
						title={strings.offerDetail.counterInstructions}
						subtitle={strings.offerDetail.counterInstructionsText}
					/>
					<TimelineDivider border={border} />

					<TimelineStep
						icon="restaurant-outline"
						title={strings.offerDetail.whatIncludes}
						subtitle={
							data.offer.description ??
							strings.offerDetail.includesFallback
						}
					/>

					{/* ── Card ecológica ───────────────────────────────────── */}
					<View style={[styles.ecoCard, { backgroundColor: cardBg }]}>
						<Ionicons name="leaf-outline" size={28} color={colors.success} />
						<AppText
							variant="labelMedium"
							weight="bold"
							style={{ marginTop: spacing.sm }}
						>
							{strings.offerDetail.wasteHero}
						</AppText>
						<AppText
							style={{
								color: muted,
								textAlign: "center",
								lineHeight: 19,
								marginTop: 4,
							}}
						>
							{strings.offerDetail.wasteHeroText}
						</AppText>
					</View>
				</View>
			</ScrollView>

			{/* ── Header con imagen expandible + gradiente ──────────────── */}
			<Animated.View
				style={[
					styles.header,
					{ height: headerHeight, opacity: headerOpacity, pointerEvents: "none" },
				]}
			>
				{data.offer.image ? (
					<Image
						source={{ uri: data.offer.image }}
						style={styles.headerImage}
						resizeMode="cover"
					/>
				) : (
					<View
						style={[styles.headerImage, { backgroundColor: colors.muted }]}
					/>
				)}
				<LinearGradient
					colors={[
						`${colors.foreground}73`,
						"transparent",
						colors.background,
					]}
					locations={[0, 0.5, 1]}
					style={styles.headerGradient}
				/>
			</Animated.View>

			{/* ── Barra flotante superior (back + favorito) ─────────────── */}
			<View style={[styles.topBar, { top: insets.top + 6 }]}>
				<CircleIconButton
					icon={
						<Ionicons
							name="chevron-back"
							size={20}
							color={colors.foreground}
						/>
					}
					onPress={() => router.back()}
				/>
				<HeartButton
					isFavorite={isFavorite}
					onPress={() => toggleFavorite.mutate(data.offer.id)}
				/>
			</View>

			{/* ── Barra de compra flotante inferior ─────────────────────── */}
			<View style={[styles.bottomBarWrap, { bottom: insets.bottom + 16 }]}>
				<View style={[styles.bottomBar, { backgroundColor: cardBg }]}>
					<View>
						<AppText
							style={{
								textDecorationLine: "line-through",
								color: muted,
								fontSize: 12,
							}}
						>
							{formatMoneyPrecise(data.offer.original_price)}
						</AppText>
						<AppText variant="h3" weight="extraBold">
							{formatMoneyPrecise(data.offer.discounted_price)}
						</AppText>
					</View>
					<Pressable
						disabled={!available}
						onPress={() => router.push(`/checkout/${data.offer.id}`)}
						style={({ pressed }) => [
							styles.saveButton,
							{
								backgroundColor: available
									? colors.primary
									: `${colors.foreground}26`,
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
		</View>
	);
}

// ─── Sub-components ────────────────────────────────────────────────

function CategoryBadge({ label }: { label: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={[styles.categoryBadge, { backgroundColor: `${colors.primary}1A` }]}
		>
			<AppText
				style={{
					color: colors.primary,
					fontWeight: "700",
					letterSpacing: 1,
					fontSize: 11,
					textTransform: "uppercase",
				}}
			>
				{label}
			</AppText>
		</View>
	);
}

function TimelineStep({
	icon,
	title,
	subtitle,
	trailing,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	title: string;
	subtitle: string;
	trailing?: ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.timelineStep}>
			<View
				style={[
					styles.timelineIcon,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<Ionicons name={icon} size={18} color={colors.foreground} />
			</View>
			<View style={styles.timelineBody}>
				<AppText weight="bold">{title}</AppText>
				<AppText
					style={{ color: colors.mutedForeground, lineHeight: 19, marginTop: 2 }}
				>
					{subtitle}
				</AppText>
			</View>
			{trailing ? <View style={{ marginLeft: spacing.md }}>{trailing}</View> : null}
		</View>
	);
}

function TimelineDivider({ border }: { border: string }) {
	return (
		<View style={styles.timelineDividerWrap}>
			<View style={[styles.timelineDivider, { backgroundColor: border }]} />
		</View>
	);
}

function distanceSubtitle(
	offer: OfferDetail,
	selectedAddress: ReturnType<typeof useSelectedAddress>,
): string {
	if (
		offer.location &&
		selectedAddress?.latitude != null &&
		selectedAddress?.longitude != null
	) {
		const distance = formatDistanceKm(
			haversineKm(
				selectedAddress.latitude,
				selectedAddress.longitude,
				offer.location.latitude,
				offer.location.longitude,
			),
		);
		return strings.offerDetail.distanceFromYou.replace("{distance}", distance);
	}
	return offer.location?.address ?? "";
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
	},
	retryPill: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 12,
		marginTop: spacing.xl,
	},
	content: {
		paddingHorizontal: spacing.xl,
	},
	categoryRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	categoryWrap: {
		flex: 1,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	categoryBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	badgeWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: spacing.xl,
	},
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 99,
	},
	onlyLeftPill: {
		borderWidth: 1,
	},
	seeLocalPill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
	},
	timelineStep: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: spacing.xl,
	},
	timelineIcon: {
		padding: 10,
		borderRadius: 99,
		borderWidth: 1,
	},
	timelineBody: {
		flex: 1,
		marginLeft: spacing.lg,
	},
	timelineDividerWrap: {
		paddingLeft: 19,
	},
	timelineDivider: {
		width: 2,
		height: 24,
	},
	ecoCard: {
		width: "100%",
		alignItems: "center",
		padding: spacing.xl,
		borderRadius: 20,
		marginTop: spacing.xl,
		boxShadow: `0px 4px 10px #00000014`,	},
	header: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		overflow: "hidden",
	},
	headerImage: {
		width: "100%",
		height: "100%",
		position: "absolute",
	},
	headerGradient: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
	},
	topBar: {
		position: "absolute",
		left: 16,
		right: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
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
		boxShadow: `0px 8px 24px #00000014`,	},
	saveButton: {
		height: 52,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
});
