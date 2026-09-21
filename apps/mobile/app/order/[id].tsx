import { router, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";

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
	ErrorState,
	Screen,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useCancelOrder, useOrder, useReviewByOrder } from "@/src/features/hooks";
import { canTransitionTo, isActiveStatus } from "@/src/features/orders/domain/order";
import { useTheme } from "@/src/core/theme";
import { DetailHeader } from "@/src/features/orders/components/order-detail/DetailHeader";
import { OrderProgressHeader } from "@/src/features/orders/components/order-detail/OrderProgressHeader";
import { PickupCodeCard } from "@/src/features/orders/components/order-detail/PickupCodeCard";
import { BusinessInfoCard } from "@/src/features/orders/components/order-detail/BusinessInfoCard";
import { ProductItemsCard } from "@/src/features/orders/components/order-detail/ProductItemsCard";
import { PriceDetailsCard } from "@/src/features/orders/components/order-detail/PriceDetailsCard";
import { InstructionsCard } from "@/src/features/orders/components/order-detail/InstructionsCard";
import { TimelineCard } from "@/src/features/orders/components/order-detail/TimelineCard";
import { ReviewBanner } from "@/src/features/orders/components/order-detail/ReviewBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OrderDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
	const { data, isLoading, isError, error, refetch, isFetching } = useOrder(id ?? "");
	const cancel = useCancelOrder();
	// Si ya existe reseña, el CTA abre el editor en modo edición.
	const { data: existingReview } = useReviewByOrder(id ?? "");
	const { colors } = useTheme();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	if (isLoading)
		return (
			<Screen>
				<View
					style={[
						styles.stickyHeader,
						{
							backgroundColor: colors.background,
							borderColor: colors.borderSolid,
						},
					]}
				>
					<Skeleton style={{ height: 56, borderRadius: radii.lg }} />
				</View>
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.container}>
						<Skeleton style={{ height: 150, borderRadius: radii.lg }} />
						<Skeleton style={{ height: 320, borderRadius: radii.lg }} />
						<Skeleton style={{ height: 176, borderRadius: radii.lg }} />
						<Skeleton style={{ height: 112, borderRadius: radii.lg }} />
						<Skeleton style={{ height: 190, borderRadius: radii.lg }} />
						<Skeleton style={{ height: 64, borderRadius: radii.lg }} />
					</View>
				</ScrollView>
			</Screen>
		);
	if (isError || !data)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { order } = data;
	const canCancel = canTransitionTo(order.status, "cancelled");

	const handleCancel = () => setConfirmCancelOpen(true);

	return (
		<Screen>
			<View
				style={[
					styles.stickyHeader,
					{
						backgroundColor: colors.background,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<DetailHeader order={order} />
			</View>

			<ScrollView
				ref={pull.ref}
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
			>
				<View style={styles.container}>
					<OrderProgressHeader order={order} />

					{isActiveStatus(order.status) && order.pickup_code ? (
						<PickupCodeCard order={order} />
					) : null}

					<BusinessInfoCard item={data} />

					<ProductItemsCard item={data} />

					<PriceDetailsCard order={order} />

					<InstructionsCard item={data} />

					<TimelineCard order={order} events={data.events} />

					{order.status === "completed" ? (
						<>
							<ReviewBanner />
							<Button
								variant="default"
								onPress={() => router.push(`/offer/${order.offer_id}`)}
								fullWidth
							>
								{strings.orders.orderAgain}
							</Button>
							<Button
								variant="outline"
								onPress={() => router.push(`/review-order/${order.id}`)}
								fullWidth
								style={styles.reviewBtn}
							>
								{existingReview
									? strings.orders.editReview
									: strings.orders.writeReview}
							</Button>
						</>
					) : null}
				</View>
			</ScrollView>

			{canCancel ? (
				<View
					style={[
						styles.bottomBar,
						{
							backgroundColor: colors.background,
							borderColor: colors.borderSolid,
						},
					]}
				>
					<Button
						variant="destructive"
						onPress={() => void handleCancel()}
						loading={cancel.isPending}
						fullWidth
					>
						{strings.orders.cancel}
					</Button>
					<AppText
						variant="caption"
						style={[styles.cancelHint, { color: colors.mutedForeground }]}
					>
						{strings.orders.cancelHint}
					</AppText>
				</View>
			) : null}
			{pull.indicator}

			<AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.orders.cancel}</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.orders.cancelConfirm}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.no}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() =>
								cancel.mutate(order.id, {
									onSuccess: () => {
										setConfirmCancelOpen(false);
										void refetch();
									},
								})
							}
						>
							<Text>{strings.orders.cancel}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

const styles = StyleSheet.create({
	stickyHeader: {
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderBottomWidth: 1,
	},
	scroll: { flex: 1 },
	scrollContent: { paddingBottom: 0 },
	container: { padding: spacing.xl, gap: spacing.lg },
	cardBlock: {  },
	bottomBar: {
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.md,
		paddingBottom: spacing.md,
		borderTopWidth: 1,
		gap: spacing.xs,
	},
	cancelHint: { textAlign: "center" },
	reviewBtn: { marginTop: spacing.sm },
});
