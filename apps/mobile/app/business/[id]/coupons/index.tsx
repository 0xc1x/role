import { CircleCheck, Plus, Tag } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import {
	useBusinessCouponCount,
	useBusinessCoupons,
} from "@/src/features/business/hooks";
import type { Coupon } from "@0xc1x/role-commons";
import { CouponCard } from "@/src/features/business/components/CouponCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function StatCard({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color: string;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.stat,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<AppText
				variant="bodySmall"
				style={{ fontSize: 10, color: colors.mutedForeground }}
			>
				{label}
			</AppText>
			<AppText variant="h3" weight="bold" style={{ color }}>
				{value}
			</AppText>
		</View>
	);
}

export default function BusinessCouponsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const {
		data: infiniteData,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useBusinessCoupons(businessId);
	// Active/total counts are server head-counts; the uses sum below reflects
	// loaded pages (no sum aggregate exists server-side) — labeled as such.
	const { data: activeCount } = useBusinessCouponCount(businessId, {
		isActive: true,
	});
	const { data: totalCount } = useBusinessCouponCount(businessId);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const coupons = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);
	const usesTotal = useMemo(
		() => coupons.reduce((sum, c) => sum + c.used_count, 0),
		[coupons],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const renderCouponItem = useCallback(
		({ item }: { item: Coupon }) => (
			<CouponCard coupon={item} businessId={businessId} />
		),
		[businessId],
	);

	if (isLoading) {
		return (
			<Screen>
				<View style={styles.container}>
					<ScreenHeader
						title={strings.business.coupons}
						fallback="/(business)/management"
					/>
					<CouponsSkeleton />
				</View>
			</Screen>
		);
	}
	if (isError)
		return (
			<Screen>
				<View style={styles.container}>
					<ScreenHeader
						title={strings.business.coupons}
						fallback="/(business)/management"
					/>
					<ErrorState error={error} onRetry={() => void refetch()} />
				</View>
			</Screen>
		);

	return (
		<Screen>
			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={coupons}
				keyExtractor={(coupon) => coupon.id}
				contentContainerStyle={styles.container}
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
				ListHeaderComponent={
					<>
						<ScreenHeader
							title={strings.business.coupons}
							fallback="/(business)/management"
						/>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground, marginTop: spacing.lg }}
						>
							{strings.business.couponsSubtitle}
						</AppText>

						<Button
							size="sm"
							icon={<Plus size={18} color={colors.primaryForeground} />}
							style={styles.newButton}
							onPress={() =>
								router.push(`/business/${businessId}/coupons/new`)
							}
						>
							{strings.business.couponNew}
						</Button>

						{(totalCount ?? 0) > 0 ? (
							<>
								<View style={styles.stats}>
									<StatCard
										label={strings.business.couponsActiveStat}
										value={String(activeCount ?? 0)}
										color={colors.successDark}
									/>
									<StatCard
										label={strings.business.couponsUsesLoadedStat}
										value={String(usesTotal)}
										color={colors.primary}
									/>
									<StatCard
										label={strings.business.couponsCreatedStat}
										value={String(totalCount ?? 0)}
										color={colors.foreground}
									/>
								</View>

								<AppText
									variant="labelSmall"
									weight="bold"
									style={{ marginTop: spacing.lg, marginBottom: spacing.md }}
								>
									{strings.business.couponsHistory}
								</AppText>
							</>
						) : null}
					</>
				}
				ListEmptyComponent={
					<Card style={styles.emptyCard}>
						<EmptyState
							icon={
								<Tag
									size={40}
									color={colors.mutedForeground}
								/>
							}
							title={strings.business.noCoupons}
							message={strings.business.noCouponsBody}
							action={
								<Button
									onPress={() =>
										router.push(`/business/${businessId}/coupons/new`)
									}
									style={{ marginTop: spacing.md }}
								>
									{strings.business.couponCreateFirst}
								</Button>
							}
						/>
					</Card>
				}
				ListFooterComponent={
					<>
						{isFetchingNextPage ? (
							<ActivityIndicator color={colors.primary} />
						) : null}
						<View
							style={[
								styles.tips,
								{
									marginTop: spacing.lg,
									backgroundColor: colors.surfaceMuted,
								},
							]}
						>
							<AppText variant="labelSmall" weight="bold" style={{ marginBottom: spacing.sm }}>
								{strings.business.couponTipsTitle}
							</AppText>
							{strings.business.couponTips.map((tip) => (
								<View key={tip} style={styles.tip}>
									<CircleCheck
										size={14}
										color={colors.success}
									/>
									<AppText
										variant="bodySmall"
										style={{ color: colors.mutedForeground, flex: 1 }}
									>
										{tip}
									</AppText>
								</View>
							))}
						</View>
					</>
				}
				renderItem={renderCouponItem}
			/>
		</Screen>
	);
}

function CouponsSkeleton() {
	return (
		<View style={styles.skeletonWrap}>
			<View style={styles.stats}>
				{[0, 1, 2].map((i) => (
					<Skeleton
						key={`coupon-stat-skeleton-${i}`}
						style={styles.skeletonStat}
					/>
				))}
			</View>
			{[0, 1].map((i) => (
				<Skeleton
					key={`coupon-skeleton-${i}`}
					style={styles.skeletonCard}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({	container: { padding: spacing.xl, flexGrow: 1 },
	newButton: { alignSelf: "flex-end", marginTop: spacing.md },
	stats: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.lg,
	},
	stat: {
		flex: 1,
		padding: spacing.md,
		borderRadius: radii.md,
		borderWidth: 1,
		gap: 2,
	},
	emptyCard: { marginTop: spacing.xl },
	tips: {
		padding: spacing.md,
		borderRadius: radii.md,
		gap: spacing.sm,
	},
	tip: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
	},
	skeletonWrap: { gap: spacing.md },
	skeletonStat: { flex: 1, height: 64, borderRadius: radii.md },
	skeletonCard: { height: 148, borderRadius: radii.lg, marginTop: spacing.md },
});