import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import {
	Animated,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessProfile } from "@/src/features/business/hooks";
import { ProfileHero } from "@/src/features/business/components/profile/ProfileHero";
import {
	AboutCard,
	BusinessHeader,
	StatsCard,
} from "@/src/features/business/components/profile/ProfileHeader";
import {
	ContactInfoCard,
	HoursCard,
} from "@/src/features/business/components/profile/ProfileContact";
import {
	LocationCard,
	ReviewsCard,
} from "@/src/features/business/components/profile/ProfileSocial";

const HERO_HEIGHT = 240;

export default function BusinessProfileScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data: profile, isLoading, isError, error, refetch } = useBusinessProfile(businessId);

	const scrollYRef = useRef<Animated.Value | null>(null);
	if (scrollYRef.current === null) {
		scrollYRef.current = new Animated.Value(0);
	}
	const scrollY = scrollYRef.current;
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

	// Full-bleed hero: sin <Screen> para que el cover ocupe el notch.
	if (isLoading) {
		return (
			<View style={[styles.flex, { backgroundColor: colors.background }]}>
				<ScrollView
					style={styles.flex}
					contentContainerStyle={{ paddingBottom: spacing.xxxl }}
					showsVerticalScrollIndicator={false}
				>
					<Skeleton style={[styles.heroSkeleton, { height: HERO_HEIGHT }]} />
					<View style={styles.content}>
						<BusinessHeaderSkeleton />
						<View style={{ height: spacing.xl }} />
						<StatsCardSkeleton />
						<View style={{ height: spacing.lg }} />
						{/* AboutCard and HoursCard render conditionally in the final view;
						    while loading their presence is unknown and seeded dev profiles
						    include both, so the skeleton mirrors them unconditionally. */}
						<AboutCardSkeleton />
						<View style={{ height: spacing.lg }} />
						<ContactInfoSkeleton />
						<View style={{ height: spacing.lg }} />
						<HoursCardSkeleton />
						<View style={{ height: spacing.lg }} />
						<ReviewsCardSkeleton />
						<View style={{ height: spacing.lg }} />
						<LocationCardSkeleton />
					</View>
				</ScrollView>
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
				<ErrorState error={error} onRetry={() => void refetch()} />
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

			<ProfileHero
				coverImage={profile.business.cover_image}
				headerHeight={headerHeight}
				headerOpacity={headerOpacity}
				topOffset={insets.top + spacing.xl}
			/>
		</View>
	);
}

/**
 * Loading placeholders mirroring each final block of the profile screen.
 * Heights and internal geometry are derived from the real components'
 * styles (ProfileHero, ProfileHeader, ProfileContact, ProfileSocial).
 */

function BusinessHeaderSkeleton() {
	return (
		<View>
			<View style={styles.headerRow}>
				<Skeleton style={styles.logoSkeleton} />
				<View style={styles.headerTextSkeleton}>
					<Skeleton style={styles.typeBadgeSkeleton} />
					<Skeleton style={styles.nameSkeleton} />
				</View>
			</View>
			<View style={styles.ratingRowSkeleton}>
				<Skeleton style={styles.ratingStarSkeleton} />
				<Skeleton style={styles.ratingValueSkeleton} />
				<Skeleton style={styles.ratingCountSkeleton} />
			</View>
		</View>
	);
}

function StatsCardSkeleton() {
	return (
		<View style={styles.statsCardSkeleton}>
			<View style={styles.statsRowSkeleton}>
				<Skeleton style={styles.statsIconSkeleton} />
				<Skeleton style={styles.statsValueSkeleton} />
			</View>
			<Skeleton style={styles.statsLabelSkeleton} />
			<Skeleton style={styles.statsMetaSkeleton} />
		</View>
	);
}

function AboutCardSkeleton() {
	return (
		<View style={styles.cardSkeleton}>
			<Skeleton style={styles.cardTitleSkeleton} />
			<View style={{ height: spacing.sm }} />
			<View style={styles.aboutLinesSkeleton}>
				<Skeleton style={styles.aboutLineSkeleton} />
				<Skeleton style={styles.aboutLineSkeleton} />
				<Skeleton style={styles.aboutLineLastSkeleton} />
			</View>
		</View>
	);
}

function InfoRowSkeleton({ withTrailing }: { withTrailing?: boolean }) {
	return (
		<View style={styles.infoRowSkeleton}>
			<Skeleton style={styles.infoIconSkeleton} />
			<View style={{ width: spacing.sm }} />
			<View style={styles.flex}>
				<Skeleton style={styles.infoLabelSkeleton} />
				<Skeleton style={styles.infoValueSkeleton} />
				{withTrailing ? <Skeleton style={styles.infoTrailingSkeleton} /> : null}
			</View>
		</View>
	);
}

function ContactInfoSkeleton() {
	return (
		<View style={styles.cardSkeleton}>
			<Skeleton style={styles.cardTitleSkeleton} />
			<View style={{ height: spacing.lg }} />
			{/* Mirrors a seeded profile: address, phone, email and website rows. */}
			<InfoRowSkeleton withTrailing />
			<View style={{ height: spacing.md }} />
			<InfoRowSkeleton />
			<View style={{ height: spacing.md }} />
			<InfoRowSkeleton />
			<View style={{ height: spacing.md }} />
			<InfoRowSkeleton />
		</View>
	);
}

function HoursRowSkeleton() {
	return (
		<View style={styles.hoursRowSkeleton}>
			<Skeleton style={styles.hoursDaySkeleton} />
			<Skeleton style={styles.hoursTimeSkeleton} />
		</View>
	);
}

function HoursCardSkeleton() {
	return (
		<View style={styles.cardSkeleton}>
			<View style={styles.hoursTitleRowSkeleton}>
				<Skeleton style={styles.hoursIconSkeleton} />
				<View style={{ width: spacing.sm }} />
				<Skeleton style={styles.hoursTitleSkeleton} />
			</View>
			<View style={{ height: spacing.md }} />
			{/* Grouped weekday ranges (e.g. Mon-Fri, Sat, Sun) as in seeded profiles. */}
			<HoursRowSkeleton />
			<HoursRowSkeleton />
			<HoursRowSkeleton />
		</View>
	);
}

function ReviewRowSkeleton() {
	return (
		<View style={styles.reviewRowSkeleton}>
			<Skeleton style={styles.reviewAvatarSkeleton} />
			<View style={{ width: spacing.sm }} />
			<View style={styles.flex}>
				<View style={styles.reviewHeaderRowSkeleton}>
					<Skeleton style={styles.reviewNameSkeleton} />
					<Skeleton style={styles.reviewDateSkeleton} />
				</View>
				<Skeleton style={styles.reviewRatingSkeleton} />
				<View style={styles.reviewCommentLinesSkeleton}>
					<Skeleton style={styles.reviewCommentLineSkeleton} />
					<Skeleton style={styles.reviewCommentLineSkeleton} />
				</View>
			</View>
		</View>
	);
}

function ReviewsCardSkeleton() {
	return (
		<View style={styles.cardSkeleton}>
			<View style={styles.reviewsHeaderRowSkeleton}>
				<Skeleton style={styles.cardTitleSkeleton} />
				<Skeleton style={styles.ratingBadgeSkeleton} />
			</View>
			<View style={{ height: spacing.lg }} />
			{/* The final view renders up to five reviews; three approximate the block. */}
			<ReviewRowSkeleton />
			<ReviewRowSkeleton />
			<ReviewRowSkeleton />
			<Skeleton style={styles.seeAllReviewsSkeleton} />
		</View>
	);
}

function LocationCardSkeleton() {
	return (
		<View style={styles.cardSkeleton}>
			<Skeleton style={styles.cardTitleSkeleton} />
			<Skeleton style={styles.addressSkeleton} />
			<View style={{ height: spacing.lg }} />
			<Skeleton style={styles.mapSkeleton} />
			<View style={{ height: spacing.md }} />
			<Skeleton style={styles.routeButtonSkeleton} />
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
	},
	content: {
		paddingHorizontal: spacing.xl,
	},
	heroSkeleton: { width: "100%", borderRadius: 0 },
	// BusinessHeader block: logo box + badge/name column + rating row.
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	logoSkeleton: { width: 86, height: 86, borderRadius: radii.xl },
	headerTextSkeleton: {
		flex: 1,
		marginLeft: spacing.md,
		paddingTop: spacing.sm,
	},
	typeBadgeSkeleton: { height: 16, width: 64, borderRadius: radii.sm },
	nameSkeleton: {
		height: 20,
		width: "70%",
		borderRadius: radii.md,
		marginTop: 6,
	},
	ratingRowSkeleton: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: spacing.md,
	},
	ratingStarSkeleton: { width: 20, height: 20, borderRadius: radii.pill },
	ratingValueSkeleton: { width: 36, height: 16, borderRadius: radii.xs },
	ratingCountSkeleton: { width: "45%", height: 16, borderRadius: radii.xs },
	// StatsCard block: centered icon+figure row with two meta bars.
	statsCardSkeleton: {
		width: "100%",
		padding: spacing.xl,
		borderRadius: radii.xl,
		alignItems: "center",
	},
	statsRowSkeleton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	statsIconSkeleton: { width: 24, height: 24, borderRadius: radii.xs },
	statsValueSkeleton: { width: 96, height: 36, borderRadius: radii.md },
	statsLabelSkeleton: {
		width: "60%",
		height: 16,
		borderRadius: radii.sm,
		marginTop: spacing.xs,
	},
	statsMetaSkeleton: {
		width: "42%",
		height: 10,
		borderRadius: radii.xs,
		marginTop: spacing.sm,
	},
	// Shared card shell: the real cards are transparent with radius xl and padding sm.
	cardSkeleton: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
	},
	cardTitleSkeleton: { width: "40%", height: 16, borderRadius: radii.xs },
	// AboutCard block: title + description lines (lineHeight 21).
	aboutLinesSkeleton: { gap: spacing.sm },
	aboutLineSkeleton: { height: 12, borderRadius: radii.xs },
	aboutLineLastSkeleton: {
		width: "68%",
		height: 12,
		borderRadius: radii.xs,
	},
	// ContactInfoCard block: icon + label/value rows.
	infoRowSkeleton: { flexDirection: "row", alignItems: "flex-start" },
	infoIconSkeleton: { width: 18, height: 18, borderRadius: radii.xs },
	infoLabelSkeleton: { width: "45%", height: 10, borderRadius: radii.xs },
	infoValueSkeleton: {
		width: "85%",
		height: 14,
		borderRadius: radii.xs,
		marginTop: 2,
	},
	infoTrailingSkeleton: {
		width: 88,
		height: 12,
		borderRadius: radii.xs,
		marginTop: spacing.xs,
	},
	// HoursCard block: icon+title row and weekday rows (space-between).
	hoursTitleRowSkeleton: { flexDirection: "row", alignItems: "center" },
	hoursIconSkeleton: { width: 20, height: 20, borderRadius: radii.xs },
	hoursTitleSkeleton: { width: "45%", height: 14, borderRadius: radii.xs },
	hoursRowSkeleton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
	},
	hoursDaySkeleton: { width: "32%", height: 14, borderRadius: radii.xs },
	hoursTimeSkeleton: { width: "38%", height: 14, borderRadius: radii.xs },
	// ReviewsCard block: title+badge header, review list rows, centered footer.
	reviewsHeaderRowSkeleton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	ratingBadgeSkeleton: { width: 56, height: 24, borderRadius: radii.sm },
	reviewRowSkeleton: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingVertical: spacing.md,
	},
	reviewAvatarSkeleton: { width: 36, height: 36, borderRadius: radii.md },
	reviewHeaderRowSkeleton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	reviewNameSkeleton: { width: "40%", height: 12, borderRadius: radii.xs },
	reviewDateSkeleton: { width: 44, height: 12, borderRadius: radii.xs },
	reviewRatingSkeleton: {
		width: "60%",
		height: 10,
		borderRadius: radii.xs,
		marginTop: 2,
	},
	reviewCommentLinesSkeleton: { gap: spacing.xs, marginTop: 6 },
	reviewCommentLineSkeleton: { height: 14, borderRadius: radii.xs },
	seeAllReviewsSkeleton: {
		width: "50%",
		height: 14,
		borderRadius: radii.xs,
		marginTop: spacing.sm,
		alignSelf: "center",
	},
	// LocationCard block: title + address + map preview (180) + route button.
	addressSkeleton: {
		width: "80%",
		height: 14,
		borderRadius: radii.xs,
		marginTop: spacing.xs,
	},
	mapSkeleton: { height: 180, borderRadius: radii.lg },
	routeButtonSkeleton: { height: 44, borderRadius: radii.md },
});
