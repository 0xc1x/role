import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	EmptyState,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
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
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId?: string }>();
	const businessId = id ?? "";
	const [filter, setFilter] = useState<ReviewFilter>("recent");

	const { data: profile } = useBusinessProfile(businessId);
	const {
		data: reviews,
		isLoading,
		isError,
		refetch,
	} = useBusinessReviews(businessId);

	const visibleReviews = useMemo(() => {
		const byOffer =
			offerId != null && offerId.length > 0
				? (reviews ?? []).filter((r) => r.offerId === offerId)
				: (reviews ?? []);
		return filterBusinessReviews(byOffer, filter);
	}, [reviews, filter, offerId]);

	const rating = profile?.business.rating ?? 0;
	const reviewCount = profile?.business.review_count ?? 0;
	const offerTitle =
		offerId != null && offerId.length > 0
			? (reviews ?? []).find((r) => r.offerId === offerId)?.offerTitle ??
				null
			: null;

	return (
		<Screen scroll contentContainerStyle={styles.content}>
			<ScreenHeader
				title={
					offerTitle ?? strings.businessProfile.reviewsTitle
				}
				fallback={`/business/${businessId}`}
			/>

			{offerTitle == null ? (
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
			) : null}

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
			<View style={styles.skeletonList}>
				{[0, 1, 2].map((i) => (
					<Skeleton key={`review-skeleton-${i}`} style={styles.skeletonCard} />
				))}
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

			{offerId != null && offerId.length > 0 ? (
				<Button
					label={strings.businessProfile.seeAllReviews.replace(
						"{n}",
						String(reviewCount),
					)}
					variant="outline"
					fullWidth
					onPress={() => router.replace(`/business/${businessId}/reviews`)}
				/>
			) : null}
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
		borderRadius: radii.pill,
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
		borderRadius: radii.md,
	},
	skeletonList: { gap: spacing.md },
	skeletonCard: { height: 110, borderRadius: radii.lg },
});
