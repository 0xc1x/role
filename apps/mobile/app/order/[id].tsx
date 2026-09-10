import { router, useLocalSearchParams } from "expo-router";
import { RefreshControl, StyleSheet, View } from "react-native";
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

import { strings } from "@/core/i18n/strings";
import {
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	useWebPullToRefresh,
} from "@/core/ui";
import { useCancelOrder, useOrder } from "@/features/hooks";
import { isActiveStatus } from "@/features/orders/domain/order";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { DetailHeader } from "@/features/orders/components/order-detail/DetailHeader";
import { PickupCodeCard } from "@/features/orders/components/order-detail/PickupCodeCard";
import { BusinessInfoCard } from "@/features/orders/components/order-detail/BusinessInfoCard";
import { ProductItemsCard } from "@/features/orders/components/order-detail/ProductItemsCard";
import { PriceDetailsCard } from "@/features/orders/components/order-detail/PriceDetailsCard";
import { InstructionsCard } from "@/features/orders/components/order-detail/InstructionsCard";
import { TimelineCard } from "@/features/orders/components/order-detail/TimelineCard";
import { ReviewBanner } from "@/features/orders/components/order-detail/ReviewBanner";

export default function OrderDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
	const { data, isLoading, isError, error, refetch, isFetching } = useOrder(id ?? "");
	const cancel = useCancelOrder();
	const { colors } = useTheme();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	if (isLoading) return <LoadingView />;
	if (isError || !data)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { order } = data;
	const canCancel = ["pending", "confirmed"].includes(order.status);

	const handleCancel = () => setConfirmCancelOpen(true);

	return (
		<Screen
			scroll
			scrollRef={pull.ref}
			refreshControl={
				<RefreshControl
					refreshing={isFetching}
					onRefresh={() => void refetch()}
					tintColor={colors.primary}
					colors={[colors.primary]}
				/>
			}
		>
			{pull.indicator}
			<View style={styles.container}>
				<DetailHeader order={order} />

				{isActiveStatus(order.status) && order.pickup_code ? (
					<PickupCodeCard order={order} />
				) : null}

				<BusinessInfoCard item={data} />

				<Card style={styles.cardBlock}>
					<ProductItemsCard item={data} />
				</Card>

				<PriceDetailsCard order={order} />

				<InstructionsCard order={order} />

				<TimelineCard order={order} events={data.events} />

				{canCancel ? (
					<Button
						label={strings.orders.cancel}
						variant="danger"
						onPress={() => void handleCancel()}
						loading={cancel.isPending}
						fullWidth
						style={styles.cancelBtn}
					/>
				) : null}

				{order.status === "completed" ? (
					<>
						<ReviewBanner />
						<Button
							label={strings.orders.orderAgain}
							variant="primary"
							onPress={() => router.push(`/offer/${order.offer_id}`)}
							fullWidth
						/>
						<Button
							label={strings.orders.writeReview}
							variant="outline"
							onPress={() => router.push(`/review-order/${order.id}`)}
							fullWidth
							style={styles.reviewBtn}
						/>
					</>
					) : null}
			</View>

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
								cancel.mutate(order.id, { onSuccess: () => void refetch() })
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
	container: { padding: spacing.xl, gap: spacing.lg },
	cardBlock: { gap: spacing.sm },
	cancelBtn: { marginTop: spacing.sm },
	reviewBtn: { marginTop: spacing.sm },
});
