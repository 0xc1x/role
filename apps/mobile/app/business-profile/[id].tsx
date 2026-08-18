import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	Animated,
	Image,
	Linking,
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
import { spacing, radii } from "@/core/theme/spacing";
import { useBusinessProfile } from "@/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import type { BusinessProfileDetail, BusinessReviewView } from "@/features/business/domain/business";
import { BusinessLocationMap } from "@/features/business/components/BusinessLocationMap";

const HERO_HEIGHT = 240;

export default function BusinessProfileScreen() {
	const { colors, scheme } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data: profile, isLoading, isError, refetch } = useBusinessProfile(businessId);

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

	if (isError || !profile) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<Ionicons
					name="location-outline"
					size={64}
					color={colors.mutedForeground}
				/>
				<AppText variant="h3" weight="bold" style={{ marginTop: spacing.md }}>
					{strings.businessProfile.notFoundTitle}
				</AppText>
				<AppText
					style={{ color: colors.mutedForeground, textAlign: "center", marginTop: spacing.xs }}
				>
					{strings.businessProfile.notFoundBody}
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

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={{ paddingBottom: 48 }}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					{ useNativeDriver: false },
				)}
				showsVerticalScrollIndicator={false}
			>
				<View style={{ height: HERO_HEIGHT }} />

				<View style={styles.content}>
					<BusinessHeader profile={profile} />
					<View style={{ height: spacing.xl }} />

					<StatsCard profile={profile} />

					{profile.business.description?.length ? (
						<>
							<View style={{ height: spacing.lg }} />
							<AboutCard description={profile.business.description} />
						</>
					) : null}

					<View style={{ height: spacing.lg }} />
					<ContactInfoCard profile={profile} />

					{profile.hours.length > 0 ? (
						<>
							<View style={{ height: spacing.lg }} />
							<HoursCard hours={profile.hours} />
						</>
					) : null}

					<View style={{ height: spacing.lg }} />
					<ReviewsCard profile={profile} />

					<View style={{ height: spacing.lg }} />
					<LocationCard profile={profile} />
				</View>
			</ScrollView>

			{/* ── Cover + gradiente ──────────────────────────────────────── */}
			<Animated.View
				style={[styles.header, { height: headerHeight, opacity: headerOpacity }]}
				pointerEvents="none"
			>
				{profile.business.cover_image ? (
					<Image
						source={{ uri: profile.business.cover_image }}
						style={styles.headerImage}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.headerImage, { backgroundColor: colors.primary }]} />
				)}
				<LinearGradient
					colors={[
						"rgba(0,0,0,0.38)",
						"transparent",
						colors.background,
					]}
					locations={[0, 0.4, 1]}
					style={styles.headerGradient}
				/>
			</Animated.View>

			{/* ── Controles superiores flotantes ─────────────────────────── */}
			<View style={[styles.topBar, { top: insets.top + 6 }]}>
				<CircleIconButton
					icon={<Ionicons name="chevron-back" size={20} color={colors.foreground} />}
					onPress={() => router.back()}
				/>
				<View style={styles.topBarRight}>
					<HeartButton isFavorite={false} onPress={() => {}} />
					<View style={{ width: spacing.sm }} />
					<CircleIconButton
						icon={<Ionicons name="share-outline" size={20} color={colors.foreground} />}
						onPress={() => {}}
					/>
				</View>
			</View>
		</View>
	);
}

// ─── Cabecera del negocio ───────────────────────────────────────────

function BusinessHeader({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View>
			<View style={styles.headerRow}>
				<View style={[styles.logoBox, { backgroundColor: colors.background }]}>
					{business.image ? (
						<Image source={{ uri: business.image }} style={styles.logo} resizeMode="cover" />
					) : (
						<View style={[styles.logo, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
							<Ionicons name="storefront-outline" size={28} color={colors.mutedForeground} />
						</View>
					)}
				</View>
				<View style={styles.headerText}>
					<View style={[styles.typeBadge, { backgroundColor: `${colors.primary}1A` }]}>
						<AppText
							style={{
								color: colors.primary,
								fontWeight: "700",
								letterSpacing: 0.8,
								fontSize: 11,
								textTransform: "uppercase",
							}}
						>
							{BUSINESS_TYPE_LABELS[business.type] ?? business.type}
						</AppText>
					</View>
					<AppText
						variant="h4"
						weight="extraBold"
						style={{ letterSpacing: -0.8, marginTop: 6 }}
					>
						{business.name}
					</AppText>
				</View>
			</View>

			<View style={[styles.ratingRow, { marginTop: spacing.md }]}>
				<Ionicons name="star" size={20} color={colors.yellow} />
				<AppText variant="bodyMedium" weight="bold">
					{(business.rating ?? 0).toFixed(1)}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.businessProfile.communityReviews.replace(
						"{n}",
						String(business.review_count ?? 0),
					)}
				</AppText>
			</View>
		</View>
	);
}

// ─── Stats / impacto ────────────────────────────────────────────────

function StatsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.statsCard,
				{
					backgroundColor: colors.surfaceSuccess,
					borderColor: colors.surfaceSuccessBorder,
				},
			]}
		>
			<View style={styles.statsRow}>
				<Ionicons name="leaf-outline" size={24} color={colors.successDark} />
				<AppText
					style={{
						fontSize: 32,
						fontWeight: "800",
						color: colors.successDark,
						marginLeft: spacing.sm,
					}}
				>
					{profile.totalRescued}
				</AppText>
			</View>
			<AppText
				weight="bold"
				style={{ color: colors.success, textAlign: "center", marginTop: spacing.xs }}
			>
				{strings.businessProfile.rescuedFromWaste}
			</AppText>
			{profile.memberSince ? (
				<AppText
					style={{
						color: `${colors.success}B3`,
						fontSize: 11,
						textAlign: "center",
						marginTop: spacing.sm,
					}}
				>
					{strings.businessProfile.partnerSince.replace(
						"{date}",
						profile.memberSince,
					)}
				</AppText>
			) : null}
		</View>
	);
}

// ─── Acerca del local ───────────────────────────────────────────────

function AboutCard({ description }: { description: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.card}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.aboutBusiness}
			</AppText>
			<AppText
				style={{ color: colors.mutedForeground, lineHeight: 21, marginTop: spacing.sm }}
			>
				{description}
			</AppText>
		</View>
	);
}

// ─── Información de contacto ────────────────────────────────────────

function ContactInfoCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View style={styles.card}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.contactInfo}
			</AppText>
			<View style={{ height: spacing.lg }} />

			<InfoRow
				icon="location-outline"
				label={strings.businessProfile.address}
				text={profile.address ?? strings.businessProfile.notAvailable}
				trailing={
					profile.latitude != null && profile.longitude != null ? (
						<Pressable
							onPress={() => void openMaps(profile.latitude!, profile.longitude!)}
						>
							<AppText weight="bold" style={{ color: colors.primary }}>
								{strings.businessProfile.directions}
							</AppText>
						</Pressable>
					) : null
				}
			/>

			{business.phone?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="call-outline"
						label={strings.businessProfile.phone}
						text={business.phone}
						onPress={() => void openUrl(`tel:${business.phone}`)}
						isLink
					/>
				</>
			) : null}

			{business.email?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="mail-outline"
						label={strings.businessProfile.email}
						text={business.email}
						onPress={() => void openUrl(`mailto:${business.email}`)}
						isLink
					/>
				</>
			) : null}

			{business.website?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="globe-outline"
						label={strings.businessProfile.website}
						text={business.website}
						onPress={() => {
							const url = business.website!.startsWith("http")
								? business.website!
								: `https://${business.website!}`;
							void openUrl(url);
						}}
						isLink
					/>
				</>
			) : null}
		</View>
	);
}

function InfoRow({
	icon,
	label,
	text,
	onPress,
	isLink,
	trailing,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	text: string;
	onPress?: () => void;
	isLink?: boolean;
	trailing?: React.ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 2 }} />
			<View style={{ width: spacing.sm }} />
			<View style={{ flex: 1 }}>
				<AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
					{label}
				</AppText>
				<Pressable onPress={onPress} disabled={!isLink}>
					<AppText
						weight={isLink ? "bold" : undefined}
						style={{ color: isLink ? colors.primary : colors.foreground, marginTop: 2 }}
					>
						{text}
					</AppText>
					{trailing ? <View style={{ marginTop: 4 }}>{trailing}</View> : null}
				</Pressable>
			</View>
		</View>
	);
}

// ─── Horarios comerciales ───────────────────────────────────────────

function HoursCard({ hours }: { hours: BusinessProfileDetail["hours"] }) {
	const { colors } = useTheme();
	return (
		<View style={styles.card}>
			<View style={styles.hoursTitleRow}>
				<Ionicons name="time-outline" size={20} color={colors.primary} />
				<View style={{ width: spacing.sm }} />
				<AppText weight="semiBold">{strings.businessProfile.businessHours}</AppText>
			</View>
			<View style={{ height: spacing.md }} />
			{hours.map((h) => {
				const closed = h.hoursDisplay === strings.businessProfile.closed;
				return (
					<View key={h.dayRange} style={styles.hoursRow}>
						<AppText weight="medium">{h.dayRange}</AppText>
						<AppText
							style={{ color: closed ? colors.destructive : colors.mutedForeground }}
						>
							{h.hoursDisplay}
						</AppText>
					</View>
				);
			})}
		</View>
	);
}

// ─── Reseñas ────────────────────────────────────────────────────────

function ReviewsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View style={styles.card}>
			<View style={styles.reviewsHeaderRow}>
				<AppText variant="labelMedium" weight="bold">
					{strings.businessProfile.reviewsTitle}
				</AppText>
				<View style={[styles.ratingBadge, { backgroundColor: colors.surfaceWarning }]}>
					<Ionicons name="star" size={14} color={colors.yellowDark} />
					<View style={{ width: 4 }} />
					<AppText weight="bold" style={{ color: colors.yellowDark }}>
						{(business.rating ?? 0).toFixed(1)}
					</AppText>
				</View>
			</View>
			<View style={{ height: spacing.lg }} />

			{profile.reviews.length === 0 ? (
				<View style={{ paddingVertical: spacing.lg }}>
					<AppText style={{ color: colors.mutedForeground, textAlign: "center" }}>
						{strings.businessProfile.noReviews}
					</AppText>
				</View>
			) : (
				profile.reviews.map((review) => <ReviewItem key={review.id} review={review} />)
			)}

			{(business.review_count ?? 0) > 3 ? (
				<AppText
					weight="bold"
					style={{ color: colors.primary, textAlign: "center", marginTop: spacing.sm }}
				>
					{strings.businessProfile.seeMoreReviews.replace(
						"{n}",
						String(business.review_count ?? 0),
					)}
				</AppText>
			) : null}
		</View>
	);
}

function ReviewItem({ review }: { review: BusinessReviewView }) {
	const { colors } = useTheme();
	const date = new Date(review.date);
	const dateLabel = Number.isNaN(date.getTime())
		? ""
		: `${date.getDate()}/${date.getMonth() + 1}`;
	return (
		<View style={styles.reviewItem}>
			<View style={[styles.avatar, { backgroundColor: colors.muted }]}>
				<Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
			</View>
			<View style={{ width: spacing.sm }} />
			<View style={{ flex: 1 }}>
				<View style={styles.reviewHeaderRow}>
					<AppText variant="labelSmall" weight="bold">
						{review.userName}
					</AppText>
					<AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
						{dateLabel}
					</AppText>
				</View>
				<View style={styles.reviewRatingRow}>
					<Ionicons name="fast-food-outline" size={12} color={colors.yellow} />
					<AppText style={{ fontSize: 12 }}>
						{strings.businessProfile.packRating.replace("{n}", String(review.productRating))}
					</AppText>
					<View style={{ width: spacing.md }} />
					<Ionicons name="storefront-outline" size={12} color={colors.yellow} />
					<AppText style={{ fontSize: 12 }}>
						{strings.businessProfile.attentionRating.replace("{n}", String(review.businessRating))}
					</AppText>
				</View>
				{review.comment ? (
					<AppText style={{ color: colors.mutedForeground, lineHeight: 19, marginTop: 6 }}>
						{review.comment}
					</AppText>
				) : null}
			</View>
		</View>
	);
}

// ─── Geolocalización ────────────────────────────────────────────────

function LocationCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const hasCoords = profile.latitude != null && profile.longitude != null;

	return (
		<View style={styles.card}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.geolocation}
			</AppText>
			<AppText style={{ color: colors.mutedForeground, marginTop: spacing.xs }}>
				{profile.address ?? ""}
			</AppText>

			{hasCoords ? (
				<>
					<View style={{ height: spacing.lg }} />
					<BusinessLocationMap
						latitude={profile.latitude!}
						longitude={profile.longitude!}
						onPress={() => void openMaps(profile.latitude!, profile.longitude!)}
					/>
					<View style={{ height: spacing.md }} />
				</>
			) : null}

			{hasCoords ? (
				<Pressable
					onPress={() => void openMaps(profile.latitude!, profile.longitude!)}
					style={[styles.routeButton, { backgroundColor: colors.primary }]}
				>
					<AppText weight="bold" style={{ color: colors.primaryForeground }}>
						{strings.businessProfile.routeInMaps}
					</AppText>
				</Pressable>
			) : null}
		</View>
	);
}

// ─── Helpers ────────────────────────────────────────────────────────

async function openMaps(latitude: number, longitude: number) {
	await Linking.openURL(
		`https://maps.google.com/?q=${latitude},${longitude}`,
	).catch(() => {});
}

async function openUrl(url: string) {
	await Linking.openURL(url).catch(() => {});
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
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	logoBox: {
		width: 86,
		height: 86,
		borderRadius: radii.xl,
		padding: 4,
		shadowColor: "#0000000F",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 1,
		shadowRadius: 12,
		elevation: 4,
	},
	logo: {
		width: "100%",
		height: "100%",
		borderRadius: radii.xl,
	},
	headerText: {
		flex: 1,
		marginLeft: spacing.md,
		paddingTop: spacing.sm,
	},
	typeBadge: {
		alignSelf: "flex-start",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	statsCard: {
		width: "100%",
		padding: spacing.xl,
		borderRadius: radii.xl,
		borderWidth: 1,
		alignItems: "center",
	},
	statsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	card: {
		width: "100%",
		padding: spacing.xl,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
		shadowColor: "#00000005",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 1,
		shadowRadius: 12,
		elevation: 2,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	hoursTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	hoursRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#00000014",
	},
	reviewsHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	ratingBadge: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
	},
	reviewItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingVertical: spacing.md,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#00000014",
	},
	avatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	reviewHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	reviewRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 2,
		gap: 4,
	},
	routeButton: {
		width: "100%",
		paddingVertical: 14,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
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
	topBarRight: {
		flexDirection: "row",
		alignItems: "center",
	},
});
