import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CircleX, QrCode } from "lucide-react-native";
import { useState } from "react";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
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
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useUpdateOrderStatus } from "@/src/features/business/hooks";
import type { OrderDetail } from "@/src/features/orders/domain/order";
import { Button } from "@/components/ui/button";

/**
 * Per-status quick actions on the order list cards (ported from Rolé v1
 * `OrderActionButtons`). `pending`/`confirmed` mark the order ready;
 * `ready_for_pickup` routes to the detail to validate the pickup code.
 */
export function OrderActionButtons({
	businessId,
	item,
}: {
	businessId: string;
	item: OrderDetail;
}) {
	const { colors } = useTheme();
	const updateStatus = useUpdateOrderStatus(businessId);
	const { order } = item;

	const markReady = () =>
		updateStatus.mutate({ orderId: order.id, status: "ready_for_pickup" });
	const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
	const handleCancel = () => setConfirmCancelOpen(true);
	const confirmCancel = () =>
		updateStatus.mutate({ orderId: order.id, status: "cancelled" });

	if (order.status === "pending") {
		return (
			<>
				<View style={styles.row}>
					<Button
						style={[
							styles.action,
							styles.markReady,
							{ backgroundColor: colors.info },
						]}
						onPress={markReady}
						loading={updateStatus.isPending}
					>
						<AppText
							variant="bodyMedium"
							weight="semiBold"
							style={[styles.label, { color: colors.primaryForeground }]}
						>
							{strings.business.ordersMarkReady}
						</AppText>
					</Button>
					<Button
						variant="outline"
						size="icon"
						style={[
							styles.cancelBtn,
							{
								backgroundColor: colors.inputBackground,
								borderColor: colors.borderSolid,
							},
						]}
						disabled={updateStatus.isPending}
						onPress={handleCancel}
						accessibilityRole="button"
						aria-label={strings.business.ordersCancelOrder}
						icon={<CircleX size={20} color={colors.destructive} />}
					/>
				</View>
				<AlertDialog
					open={confirmCancelOpen}
					onOpenChange={setConfirmCancelOpen}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{strings.business.ordersCancelOrder}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{strings.business.ordersCancelConfirm}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Text>{strings.common.no}</Text>
							</AlertDialogCancel>
							<AlertDialogAction onPress={confirmCancel}>
								<Text>{strings.business.ordersCancelOrder}</Text>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		);
	}

	if (order.status === "confirmed") {
		return (
			<Button
				style={[styles.action, styles.full, { backgroundColor: colors.info }]}
				onPress={markReady}
				loading={updateStatus.isPending}
			>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={[styles.label, { color: colors.primaryForeground }]}
				>
					{strings.business.ordersMarkReady}
				</AppText>
			</Button>
		);
	}

	if (order.status === "ready_for_pickup") {
		return (
			<Button
				icon={<QrCode size={18} color={colors.primaryForeground} />}
				style={[
					styles.action,
					styles.full,
					{ backgroundColor: colors.success },
				]}
				onPress={() => router.push(`/business/${businessId}/order/${order.id}`)}
			>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={[styles.label, { color: colors.primaryForeground }]}
				>
					{strings.business.ordersValidateAndDeliver}
				</AppText>
			</Button>
		);
	}

	return null;
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	action: {
		height: "auto",
		minHeight: 44,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	label: { flexShrink: 1, textAlign: "center" },
	markReady: { flex: 1, minWidth: 0 },
	full: {
		width: "100%",
	},
	cancelBtn: {
		minWidth: 44,
		minHeight: 44,
		width: 44,
		height: 44,
		borderRadius: radii.pill,
	},
});
