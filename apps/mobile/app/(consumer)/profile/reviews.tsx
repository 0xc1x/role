import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
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

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
	useWebPullToRefresh,
} from "@/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteReview, useMyReviews } from "@/features/hooks";
import type { MyReviewView } from "@/features/orders/domain/order";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function MyReviewsScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } =
		useMyReviews();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

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
				data={data ?? []}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
				keyboardShouldPersistTaps="handled"
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
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
							<Ionicons
								name="star-outline"
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
		<Card style={styles.card}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<AppText variant="bodyMedium" weight="bold">
						{item.offerTitle}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{item.businessName} · {dateLabel}
					</AppText>
				</View>
				<View style={styles.starsRow}>
					<Ionicons name="star" size={14} color={colors.warning} />
					<AppText variant="bodySmall" weight="semiBold">
						{((item.productRating + item.businessRating) / 2).toFixed(1)}
					</AppText>
				</View>
			</View>

			{item.comment ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: spacing.sm }}
				>
					{item.comment}
				</AppText>
			) : null}

			<View style={styles.actionsRow}>
				<Button
					label={strings.orders.editReview}
					variant="outline"
					size="sm"
					style={{ flex: 1 }}
					onPress={() => router.push(`/review-order/${item.orderId}`)}
				/>
				<Button
					label={strings.orders.deleteReview}
					variant="danger"
					size="sm"
					style={{ flex: 1 }}
					loading={remove.isPending}
					onPress={() => setConfirmOpen(true)}
				/>
			</View>

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
	card: { padding: spacing.lg, gap: spacing.sm },
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	starsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	actionsRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
});
