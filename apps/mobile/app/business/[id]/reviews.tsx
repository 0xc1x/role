import { useCallback, useMemo } from "react";
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";
import { Star } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	Screen,
	ScreenHeader,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import {
	useBusinessProfile,
	useBusinessReviewCount,
	useBusinessReviews,
} from "@/src/features/business/hooks";
import {
	filterBusinessReviews,
	type BusinessReviewView,
	type ReviewFilter,
} from "@/src/features/business/domain/business";
import { ReviewItem } from "@/src/features/business/components/ReviewItem";
import { Button } from "@/components/ui/button";

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
	const offerIdParam =
		offerId != null && offerId.length > 0 ? offerId : undefined;
	const {
		data: infiniteData,
		isLoading,
		isError,
		refetch,
		isFetching,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useBusinessReviews(businessId, { offerId: offerIdParam });
	const { data: totalCount } = useBusinessReviewCount(businessId, {
		offerId: offerIdParam,
	});
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	// Server filters by offer; recent/recommended is a presentational sort
	// over the loaded pages (server already orders by date desc, and no
	// server ordering exists for the recommended average — labeled below).
	const allReviews = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);
	const visibleReviews = useMemo(
		() => filterBusinessReviews(allReviews, filter),
		[allReviews, filter],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const renderReviewItem = useCallback(
		({ item }: { item: BusinessReviewView }) => (
			<ReviewItem review={item} />
		),
		[],
	);

	const rating = profile?.business.rating ?? 0;
	const reviewCount = totalCount ?? profile?.business.review_count ?? 0;
	const offerTitle =
		offerIdParam != null
			? (allReviews.find((r) => r.offerId === offerIdParam)?.offerTitle ??
				null)
			: null;

	const header = (
		<View style={styles.headerBlock}>
			<ScreenHeader
				title={
					offerTitle ?? strings.businessProfile.reviewsTitle
				}
				fallback={`/business/${businessId}`}
			/>

			{offerTitle == null ? (
				<View style={styles.summaryRow}>
					<View style={[styles.ratingBadge, { backgroundColor: colors.surfaceWarning }]}>
						<Star size={16} color={colors.yellowDark} />
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
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{strings.businessProfile.reviewsScopeNote}
			</AppText>
		</View>
	);

	if (isLoading) {
		return (
			<Screen>
				<View style={styles.content}>
					{header}
					<View style={styles.skeletonList}>
						{[0, 1, 2].map((i) => (
							<Skeleton key={`review-skeleton-${i}`} style={styles.skeletonCard} />
						))}
					</View>
				</View>
			</Screen>
		);
	}

	if (isError) {
		return (
			<Screen>
				<View style={styles.content}>
					{header}
					<View style={styles.centerBox}>
						<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
							{strings.common.error}
						</AppText>
						<Button onPress={() => void refetch()}>
							{strings.common.retry}
						</Button>
					</View>
				</View>
			</Screen>
		);
	}

	return (
		<Screen>
			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={visibleReviews}
				keyExtractor={(review) => review.id}
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListHeaderComponent={header}
				ListFooterComponent={
					<>
						{isFetchingNextPage ? (
							<ActivityIndicator color={colors.primary} />
						) : null}
						{offerIdParam != null ? (
							<Button
								variant="outline"
								fullWidth
								onPress={() => router.replace(`/business/${businessId}/reviews`)}
							>
								{strings.businessProfile.seeAllReviews.replace(
									"{n}",
									String(reviewCount),
								)}
							</Button>
						) : null}
					</>
				}
				ListEmptyComponent={
					<EmptyState
						icon={<Star size={28} color={colors.mutedForeground} />}
						title={
							allReviews.length === 0
								? strings.businessProfile.noReviews
								: strings.businessProfile.noFilteredReviews
						}
					/>
				}
				renderItem={renderReviewItem}
			/>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: spacing.xl,
		gap: spacing.lg,
		paddingBottom: spacing.xxl,
	},
	headerBlock: {
		gap: spacing.lg,
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
