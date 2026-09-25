import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Star } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import type { BusinessProfileDetail } from "@/src/features/business/domain/business";
import { BusinessLocationMap } from "@/src/features/business/components/BusinessLocationMap";
import { ReviewItem } from "@/src/features/business/components/ReviewItem";
import { openMaps } from "./maps";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";

export function ReviewsCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<Card style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<CardHeader style={styles.reviewsHeaderRow}>
				<AppText variant="labelMedium" weight="bold">
					{strings.businessProfile.reviewsTitle}
				</AppText>
				<View
					style={[
						styles.ratingBadge,
						{ backgroundColor: colors.surfaceWarning },
					]}
				>
					<Star size={14} color={colors.yellowDark} />
					<View style={{ width: 4 }} />
					<AppText weight="bold" style={{ color: colors.yellowDark }}>
						{(business.rating ?? 0).toFixed(1)}
					</AppText>
				</View>
			</CardHeader>
			<CardContent>
				{profile.reviews.length === 0 ? (
					<View>
						<AppText
							style={{ color: colors.mutedForeground, textAlign: "center" }}
						>
							{strings.businessProfile.noReviews}
						</AppText>
					</View>
				) : (
					profile.reviews.map((review) => (
						<ReviewItem key={review.id} review={review} />
					))
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
							style={{
								color: colors.primary,
								textAlign: "center",
								marginTop: spacing.sm,
							}}
						>
							{strings.businessProfile.seeAllReviews.replace(
								"{n}",
								String(business.review_count ?? 0),
							)}
						</AppText>
					</Pressable>
				) : null}
			</CardContent>
		</Card>
	);
}

export function LocationCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const hasCoords = profile.latitude != null && profile.longitude != null;

	return (
		<Card style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<CardHeader>
				<AppText variant="labelMedium" weight="bold">
					{strings.businessProfile.geolocation}
				</AppText>
			</CardHeader>

			<CardDescription>
				<AppText
					style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
				>
					{profile.address ?? ""}
				</AppText>
			</CardDescription>

			<CardContent>
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
			</CardContent>
		</Card>
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
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radii.xs,
	},
	routeButton: {
		width: "100%",
		paddingVertical: spacing.md,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
});
