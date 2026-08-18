import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useUpdateOrderStatus } from "@/features/business/hooks";
import type { OrderDetail } from "@/features/orders/domain/order";

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

	if (order.status === "pending") {
		return (
			<View style={styles.row}>
				<Button
					label={strings.business.ordersMarkReady}
					variant="primary"
					style={[styles.markReady, { backgroundColor: colors.info }]}
					onPress={markReady}
					loading={updateStatus.isPending}
				/>
				<Pressable
					onPress={() =>
						updateStatus.mutate({ orderId: order.id, status: "cancelled" })
					}
					accessibilityRole="button"
					accessibilityLabel={strings.business.ordersCancelOrder}
					style={({ pressed }) => [
						styles.cancelBtn,
						{ borderColor: colors.borderSolid, opacity: pressed ? 0.8 : 1 },
					]}
				>
					<Ionicons name="close-circle-outline" size={20} color={colors.destructive} />
				</Pressable>
			</View>
		);
	}

	if (order.status === "confirmed") {
		return (
			<Button
				label={strings.business.ordersMarkReady}
				variant="primary"
				style={[styles.full, { backgroundColor: colors.info }]}
				onPress={markReady}
				loading={updateStatus.isPending}
			/>
		);
	}

	if (order.status === "ready_for_pickup") {
		return (
			<Button
				label={strings.business.ordersValidateAndDeliver}
				variant="primary"
				icon={<Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />}
				style={[styles.full, { backgroundColor: colors.success }]}
				onPress={() => router.push(`/business/${businessId}/order/${order.id}`)}
			/>
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
	markReady: { flex: 1 },
	full: {
		width: "100%",
	},
	cancelBtn: {
		width: 44,
		height: 44,
		borderWidth: 1,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
});