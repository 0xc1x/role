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

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	ErrorState,
	Screen,
	useWebPullToRefresh,
} from "@/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { spacing, radii } from "@/core/theme/spacing";
import { useCancelOrder, useOrder } from "@/features/hooks";
import { isActiveStatus } from "@/features/orders/domain/order";
import { useTheme } from "@/core/theme";
import { DetailHeader } from "@/features/orders/components/order-detail/DetailHeader";
import { OrderProgressHeader } from "@/features/orders/components/order-detail/OrderProgressHeader";
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
	const canCancel = ["pending", "confirmed"].includes(order.status);

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

					<Card style={styles.cardBlock}>
						<ProductItemsCard item={data} />
					</Card>

					<PriceDetailsCard order={order} />

					<InstructionsCard item={data} />

					<TimelineCard order={order} events={data.events} />

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
						label={strings.orders.cancel}
						variant="danger"
						onPress={() => void handleCancel()}
						loading={cancel.isPending}
						fullWidth
					/>
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
	stickyHeader: {
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderBottomWidth: 1,
	},
	scroll: { flex: 1 },
	scrollContent: { paddingBottom: spacing.xl },
	container: { padding: spacing.xl, gap: spacing.lg },
	cardBlock: { gap: spacing.sm },
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
