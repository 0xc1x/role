import { useRef, type ReactNode } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Animated,
	Image,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, CircleIconButton, goBackOr, HeartButton, useWebPullToRefresh } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
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
	formatMoney,
	formatMoneyPrecise,
	formatDistanceKm,
	formatDateTime,
} from "@/core/utils/formatters";

const HERO_HEIGHT = 320;
const BOTTOM_BAR_HEIGHT = 92;

export default function OfferDetailScreen() {
	const { colors, scheme } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const offerId = id ?? "";
	const { data, isLoading, isError, error, refetch, isFetching } = useOffer(offerId);
	const isFavorite = useIsFavorite(offerId);
	const toggleFavorite = useToggleFavorite();
	const selectedAddress = useSelectedAddress();

	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: !!isFetching,
	});
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
	const saveAmount = Math.max(
		0,
		data.offer.original_price - data.offer.discounted_price,
	);
	const outOfStock = isOfferOutOfStock(data);
	const available = isOfferAvailable(data);
	const includes = splitList(data.offer.includes ?? "");
	const allergens = splitList(data.offer.allergens ?? "");
	const isDark = scheme === "dark";
	const cardBg = isDark ? colors.card : colors.background;
	const muted = colors.mutedForeground;
	const border = colors.borderSolid;

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{pull.indicator}
			<ScrollView
				ref={pull.ref}
				style={styles.flex}
				contentContainerStyle={{ paddingBottom: 140 }}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					{ useNativeDriver: false },
				)}
				showsVerticalScrollIndicator={false}
				refreshControl={<RefreshControl refreshing={!!isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
			>
				<View style={{ height: HERO_HEIGHT }} />

				<View style={styles.content}>
					{/* ── Categorías de la oferta + rating ────────────────── */}
					{data.categories.length > 0 || data.offer.rating > 0 ? (
						<View style={styles.categoryRow}>
							<View style={styles.categoryWrap}>
								{data.categories.map((c) => (
									<CategoryBadge
										key={c.id}
										label={c.emoji ? `${c.emoji} ${c.name}` : c.name}
									/>
								))}
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
					) : null}

					{/* ── Título de la oferta + negocio ───────────────────── */}
					<AppText
						variant="h2"
						weight="extraBold"
						style={{ letterSpacing: -0.5, marginTop: spacing.sm }}
					>
						{data.offer.title}
					</AppText>
					<Pressable
						onPress={() =>
							router.push(`/business-profile/${data.offer.business_id}`)
						}
						hitSlop={8}
					>
						<View style={styles.businessSubtitle}>
							<Ionicons name="storefront-outline" size={14} color={muted} />
							<AppText variant="bodyMedium" style={{ color: muted }}>
								{data.business.name}
							</AppText>
						</View>
					</Pressable>

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

					{/* ── Precio + ahorro ─────────────────────────────────── */}
					<View style={styles.priceRow}>
						<AppText
							variant="h2"
							weight="extraBold"
							style={{ color: colors.primary }}
						>
							{formatMoneyPrecise(data.offer.discounted_price)}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ textDecorationLine: "line-through", color: muted }}
						>
							{formatMoneyPrecise(data.offer.original_price)}
						</AppText>
						{saveAmount > 0 ? (
							<View
								style={[
									styles.savePill,
									{ backgroundColor: `${colors.success}1A` },
								]}
							>
								<AppText
									variant="labelSmall"
									weight="bold"
									style={{ color: colors.success }}
								>
									{strings.offerDetail.saveAmount.replace(
										"{amount}",
										formatMoney(saveAmount),
									)}
								</AppText>
							</View>
						) : null}
					</View>

					{/* ── Sobre esta oferta ───────────────────────────────── */}
					{data.offer.description || includes.length > 0 ? (
						<InfoCard title={strings.offerDetail.aboutTitle} cardBg={cardBg} border={border}>
							{data.offer.description ? (
								<AppText
									variant="bodyMedium"
									style={{ color: muted, lineHeight: 20 }}
								>
									{data.offer.description}
								</AppText>
							) : null}
							{includes.length > 0 ? (
								<View style={styles.includesBlock}>
									<AppText variant="labelMedium" weight="bold">
										{strings.offerDetail.whatIncludes}
									</AppText>
									{includes.map((item) => (
										<View key={item} style={styles.listRow}>
											<Ionicons
												name="checkmark-circle"
												size={18}
												color={colors.success}
											/>
											<AppText variant="bodyMedium" style={{ flex: 1 }}>
												{item}
											</AppText>
										</View>
									))}
								</View>
							) : null}
						</InfoCard>
					) : null}

					{/* ── Alérgenos ───────────────────────────────────────── */}
					{allergens.length > 0 ? (
						<InfoCard
							title={strings.business.allergensTitle}
							cardBg={cardBg}
							border={border}
						>
							<View
								style={[
									styles.allergenRow,
									{ backgroundColor: colors.surfaceWarning },
								]}
							>
								{allergens.map((item) => (
									<View
										key={item}
										style={[styles.allergenChip, { backgroundColor: colors.warning }]}
									>
										<AppText variant="bodySmall" weight="semiBold" color="#FFFFFF">
											{item}
										</AppText>
									</View>
								))}
							</View>
						</InfoCard>
					) : null}

					{/* ── Recogida ────────────────────────────────────────── */}
					<InfoCard
						title={strings.offerDetail.pickupSchedule}
						cardBg={cardBg}
						border={border}
					>
						<InfoRow
							icon="calendar-outline"
							label={strings.business.pickupFrom}
							value={formatDateTime(data.offer.pickup_start)}
						/>
						<InfoRow
							icon="time-outline"
							label={strings.business.availableUntil}
							value={formatDateTime(data.offer.pickup_end)}
						/>
						<InfoRow
							icon="cube-outline"
							label={strings.offerDetail.availablePacks}
							value={strings.offerDetail.packsLeftText
								.replace("{stock}", String(data.offer.stock))
								.replace(
									"{initial}",
									String(data.offer.initial_stock || data.offer.stock),
								)}
						/>
						<View style={[styles.noteRow, { backgroundColor: `${colors.primary}0D` }]}>
							<Ionicons
								name="information-circle-outline"
								size={18}
								color={colors.primary}
							/>
							<AppText
								variant="bodySmall"
								style={{ flex: 1, color: muted, lineHeight: 18 }}
							>
								{strings.offerDetail.counterInstructionsText}
							</AppText>
						</View>
					</InfoCard>

					{/* ── Establecimiento ─────────────────────────────────── */}
					<InfoCard
						title={strings.offerDetail.establishment}
						cardBg={cardBg}
						border={border}
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
					>
						<View style={styles.businessHead}>
							{data.business.image ? (
								<Image
									source={{ uri: data.business.image }}
									style={styles.businessLogo}
								/>
							) : (
								<View style={[styles.businessLogo, styles.businessLogoPlaceholder]}>
									<Ionicons name="storefront-outline" size={20} color={muted} />
								</View>
							)}
							<View style={styles.businessMeta}>
								<AppText variant="h4" weight="bold" numberOfLines={1}>
									{data.business.name}
								</AppText>
								<AppText variant="bodySmall" style={{ color: muted }}>
									{BUSINESS_TYPE_LABELS[data.business.type] ??
										data.business.type}
								</AppText>
							</View>
						</View>
						{(data.business.rating ?? 0) > 0 ? (
							<View style={styles.businessRatingRow}>
								<Ionicons name="star" size={16} color={colors.yellow} />
								<AppText variant="bodyMedium" weight="bold">
									{(data.business.rating ?? 0).toFixed(1)}
								</AppText>
								<AppText variant="bodySmall" style={{ color: muted }}>
									({data.business.review_count})
								</AppText>
							</View>
						) : null}
						<View style={styles.addressRow}>
							<Ionicons name="location-outline" size={16} color={muted} />
							<AppText
								variant="bodyMedium"
								style={{ flex: 1, color: muted, lineHeight: 19 }}
							>
								{distanceSubtitle(data, selectedAddress) ||
									strings.businessProfile.notAvailable}
							</AppText>
						</View>
					</InfoCard>

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

			{/* ── Barra flotante superior (back + favorito) — alineada a spacing.xl ─────────────── */}
			<View style={[styles.topBar, { top: insets.top + spacing.xl }]}>
				<CircleIconButton
					icon={
						<Ionicons
							name="chevron-back"
							size={20}
							color={colors.foreground}
						/>
					}
					onPress={() => goBackOr("/(consumer)")}
				/>
				<HeartButton
					isFavorite={isFavorite}
					onPress={() => toggleFavorite.mutate(data.offer.id)}
				/>
			</View>

			{/* ── Barra de compra flotante inferior ─────────────────────── */}
			<View style={[styles.bottomBarWrap, { bottom: insets.bottom + 16 }]}>
				<View style={[styles.bottomBar, { backgroundColor: colors.card }]}>
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

function InfoCard({
	title,
	trailing,
	cardBg,
	border,
	children,
}: {
	title: string;
	trailing?: ReactNode;
	cardBg: string;
	border: string;
	children: ReactNode;
}) {
	return (
		<View
			style={[
				styles.infoCard,
				{ backgroundColor: cardBg, borderColor: border },
			]}
		>
			<View style={styles.infoCardHead}>
				<AppText variant="h4" weight="bold" style={{ flex: 1 }}>
					{title}
				</AppText>
				{trailing}
			</View>
			{children}
		</View>
	);
}

function InfoRow({
	icon,
	label,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<View style={[styles.infoRowIcon, { backgroundColor: `${colors.primary}14` }]}>
				<Ionicons name={icon} size={15} color={colors.primary} />
			</View>
			<View style={styles.infoRowBody}>
				<AppText variant="labelSmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="semiBold">
					{value}
				</AppText>
			</View>
		</View>
	);
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
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
	businessSubtitle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 6,
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
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	savePill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
	},
	infoCard: {
		width: "100%",
		borderWidth: 1,
		borderRadius: 20,
		padding: spacing.xl,
		gap: spacing.lg,
		marginTop: spacing.xl,
	},
	infoCardHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	infoRowIcon: {
		padding: 8,
		borderRadius: radii.md,
	},
	infoRowBody: {
		flex: 1,
		gap: 1,
	},
	includesBlock: {
		gap: spacing.sm,
	},
	listRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	allergenRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		padding: spacing.md,
		borderRadius: radii.md,
	},
	allergenChip: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.pill,
	},
	noteRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		padding: spacing.md,
		borderRadius: radii.md,
	},
	seeLocalPill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
	},
	businessHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	businessLogo: {
		width: 48,
		height: 48,
		borderRadius: radii.md,
	},
	businessLogoPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#E5E5E5",
	},
	businessMeta: {
		flex: 1,
		gap: 1,
	},
	businessRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	addressRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
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
		left: spacing.xl,
		right: spacing.xl,
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
