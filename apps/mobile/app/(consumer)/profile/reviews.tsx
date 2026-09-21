import { Star } from "lucide-react-native";
import { router } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";
import { toast } from "sonner-native";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteReview, useMyReviews } from "@/src/features/hooks";
import type { MyReviewView } from "@/src/features/orders/domain/order";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function MyReviewsScreen() {
	const { colors } = useTheme();
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
	} = useMyReviews();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	const items = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item }: { item: MyReviewView }) => <ReviewRow item={item} />,
		[],
	);

	if (isLoading) {
		return (
			<Screen>
				<View style={styles.list}>
					<ScreenHeader
						title={strings.orders.myReviews}
						fallback="/(consumer)/profile"
						style={{ marginBottom: spacing.lg }}
					/>
					{[0, 1, 2].map((i) => (
						<Skeleton
							key={`review-skeleton-${i}`}
							style={{ height: 148, borderRadius: radii.lg }}
						/>
					))}
				</View>
			</Screen>
		);
	}
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	return (
		<Screen>
			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={items}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
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
				ListFooterComponent={
					isFetchingNextPage ? (
						<ActivityIndicator color={colors.primary} />
					) : null
				}
				ListHeaderComponent={
					<ScreenHeader
						title={strings.orders.myReviews}
						fallback="/(consumer)/profile"
						style={{ marginBottom: spacing.lg }}
					/>
				}
				ListEmptyComponent={
					<EmptyState
						icon={
							<Star
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.orders.myReviewsEmpty}
						message={strings.orders.myReviewsEmptyHint}
					/>
				}
				renderItem={renderItem}
			/>
		</Screen>
	);
}

const ReviewRow = memo(function ReviewRow({ item }: { item: MyReviewView }) {
	const { colors } = useTheme();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const remove = useDeleteReview();
	const date = new Date(item.date);
	const dateLabel = Number.isNaN(date.getTime())
		? ""
		: `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

	return (
		<Card >
			<CardHeader style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<AppText variant="h2" weight="bold">
						{item.offerTitle}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{item.businessName} · {dateLabel}
					</AppText>
				</View>
				<View style={styles.starsRow}>
					<Star size={20} color={colors.warning} />
					<AppText variant="bodyMedium" weight="semiBold">
						{((item.productRating + item.businessRating) / 2).toFixed(1)}
					</AppText>
				</View>
			</CardHeader>
			
			<CardContent>
				{item.comment ? (
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, marginTop: spacing.sm }}
					>
						{item.comment}
					</AppText>
				) : null}
			</CardContent>

			<CardFooter style={styles.actionsRow}>
				<Button
					variant="outline"
					size="sm"
					style={{ flex: 1 }}
					onPress={() => router.push(`/review-order/${item.orderId}`)}
				>
					{strings.orders.editReview}
				</Button>
				<Button
					variant="destructive"
					size="sm"
					style={{ flex: 1 }}
					loading={remove.isPending}
					onPress={() => setConfirmOpen(true)}
				>
					{strings.orders.deleteReview}
				</Button>
			</CardFooter>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.orders.deleteReview}</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.orders.deleteReviewConfirm}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.no}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() =>
								remove.mutate(item.id, {
									onSuccess: () => {
										setConfirmOpen(false);
										toast.success(strings.orders.reviewDeleted);
									},
								})
							}
						>
							<Text>{strings.orders.deleteReview}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
});

const styles = StyleSheet.create({
	list: { padding: spacing.xl, gap: spacing.md },
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingTop: spacing.md
	},
	starsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	actionsRow: {
		flexDirection: "row",
		marginTop: spacing.md,
	},
});
