import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, EmptyState, Screen, ScreenHeader } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import {
	useBusinessProfile,
	useBusinessReviews,
} from "@/features/business/hooks";
import {
	filterBusinessReviews,
	type ReviewFilter,
} from "@/features/business/domain/business";
import { ReviewItem } from "@/features/business/components/ReviewItem";

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
	{ id: "recent", label: strings.businessProfile.filterRecent },
	{ id: "recommended", label: strings.businessProfile.filterRecommended },
];

export default function BusinessReviewsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const [filter, setFilter] = useState<ReviewFilter>("recent");

	const { data: profile } = useBusinessProfile(businessId);
	const {
		data: reviews,
		isLoading,
		isError,
		refetch,
	} = useBusinessReviews(businessId);

	const visibleReviews = useMemo(
		() => filterBusinessReviews(reviews ?? [], filter),
		[reviews, filter],
	);

	const rating = profile?.business.rating ?? 0;
	const reviewCount = profile?.business.review_count ?? 0;

	return (
		<Screen scroll contentContainerStyle={styles.content}>
			<ScreenHeader
				title={strings.businessProfile.reviewsTitle}
				fallback="/(consumer)"
			/>

			<View style={styles.summaryRow}>
				<View style={[styles.ratingBadge, { backgroundColor: colors.surfaceWarning }]}>
					<Ionicons name="star" size={16} color={colors.yellowDark} />
					<View style={{ width: 4 }} />
					<AppText weight="bold" style={{ color: colors.yellowDark }}>
						{rating.toFixed(1)}
					</AppText>
				</View>
				<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
					{strings.businessProfile.communityReviews.replace("{n}", String(reviewCount))}
				</AppText>
			</View>

			<View style={styles.chipsRow}>
				{FILTERS.map((option) => {
					const selected = option.id === filter;
					return (
						<Pressable
							key={option.id}
							onPress={() => setFilter(option.id)}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							style={[
								styles.chip,
								{
									backgroundColor: selected ? colors.primary : "transparent",
									borderColor: selected ? colors.primary : colors.borderSolid,
								},
							]}
						>
							<AppText
								variant="bodySmall"
								weight={selected ? "semiBold" : "medium"}
								style={{
									color: selected ? colors.primaryForeground : colors.mutedForeground,
								}}
							>
								{option.label}
							</AppText>
						</Pressable>
					);
				})}
			</View>

			{isLoading ? (
				<View style={styles.centerBox}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : isError ? (
				<View style={styles.centerBox}>
					<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
						{strings.common.error}
					</AppText>
					<Pressable
						onPress={() => void refetch()}
						style={[styles.retry, { backgroundColor: colors.primary }]}
					>
						<AppText weight="bold" style={{ color: colors.primaryForeground }}>
							{strings.common.retry}
						</AppText>
					</Pressable>
				</View>
			) : visibleReviews.length === 0 ? (
				<EmptyState
					icon={<Ionicons name="star-outline" size={28} color={colors.mutedForeground} />}
					title={
						(reviews ?? []).length === 0
							? strings.businessProfile.noReviews
							: strings.businessProfile.noFilteredReviews
					}
				/>
			) : (
				<View>
					{visibleReviews.map((review) => (
						<ReviewItem key={review.id} review={review} />
					))}
				</View>
			)}
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: spacing.xl,
		gap: spacing.lg,
		paddingBottom: spacing.xxl,
	},
	summaryRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	ratingBadge: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: radii.md,
	},
	chipsRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: 999,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 38,
	},
	centerBox: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xxl,
		gap: spacing.md,
	},
	retry: {
		paddingHorizontal: 24,
		paddingVertical: spacing.md,
		borderRadius: 12,
	},
});
