import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { BusinessProfileDetail } from "@/features/business/domain/business";
import { BusinessLocationMap } from "@/features/business/components/BusinessLocationMap";
import { ReviewItem } from "@/features/business/components/ReviewItem";
import { openMaps } from "./maps";

export function ReviewsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
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

			{(business.review_count ?? 0) > 0 ? (
				<Pressable
					onPress={() =>
						router.push(`/business-profile/${business.id}/reviews`)
					}
					hitSlop={8}
					accessibilityRole="link"
				>
					<AppText
						weight="bold"
						style={{ color: colors.primary, textAlign: "center", marginTop: spacing.sm }}
					>
						{strings.businessProfile.seeAllReviews.replace(
							"{n}",
							String(business.review_count ?? 0),
						)}
					</AppText>
				</Pressable>
			) : null}
		</View>
	);
}

export function LocationCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const hasCoords = profile.latitude != null && profile.longitude != null;

	return (
		<View style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.geolocation}
			</AppText>
			<AppText style={{ color: colors.mutedForeground, marginTop: spacing.xs }}>
				{profile.address ?? ""}
			</AppText>

			{hasCoords && profile.latitude != null && profile.longitude != null ? (
				<>
					<View style={{ height: spacing.lg }} />
					<BusinessLocationMap
						latitude={profile.latitude}
						longitude={profile.longitude}
						onPress={() => {
							const lat = profile.latitude;
							const lng = profile.longitude;
							if (lat != null && lng != null) void openMaps(lat, lng);
						}}
					/>
					<View style={{ height: spacing.md }} />
				</>
			) : null}

			{hasCoords && profile.latitude != null && profile.longitude != null ? (
				<Pressable
					onPress={() => {
						const lat = profile.latitude;
						const lng = profile.longitude;
						if (lat != null && lng != null) void openMaps(lat, lng);
					}}
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

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
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
	routeButton: {
		width: "100%",
		paddingVertical: 14,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
});
