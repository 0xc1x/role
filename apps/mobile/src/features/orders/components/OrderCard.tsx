import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { AppText, StatusBadge, type BadgeTone } from "@/core/ui";
import {
	isActiveStatus,
	orderStatusLabels,
	type OrderDetail,
	type OrderStatusType,
} from "@/features/orders/domain/order";
import {
	formatMoneyPrecise,
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

/** Presentational mapping of order status → badge tone. */
export function orderStatusTone(status: OrderStatusType): BadgeTone {
	switch (status) {
		case "pending":
			return "warning";
		case "confirmed":
			return "info";
		case "ready_for_pickup":
			return "brand";
		case "picked_up":
			return "info";
		case "completed":
			return "success";
		case "cancelled":
			return "neutral";
		case "expired":
			return "danger";
	}
}

/** Ledger card for the orders list and the profile history (port of ProfileOrderCard). */
export function OrderCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const isActive = isActiveStatus(item.order.status);
	const { offerImageUrl, order } = item;

	const dateLine =
		order.pickup_time != null
			? `${formatShortDate(order.created_at)} • ${formatTime(order.pickup_time)}`
			: formatShortDate(order.created_at);

	return (
		<Pressable
			onPress={() => router.push(`/order/${order.id}`)}
			style={[
				styles.card,
				{
					borderColor: colors.borderSolid,
					backgroundColor: colors.card,
				},
			]}
		>
			<View style={styles.row}>
				{offerImageUrl ? (
					<Image source={{ uri: offerImageUrl }} style={styles.thumb} />
				) : (
					<View
						style={[
							styles.thumb,
							styles.thumbFallback,
							{ backgroundColor: colors.muted },
						]}
					>
						<Ionicons
							name="storefront-outline"
							size={26}
							color={colors.mutedForeground}
						/>
					</View>
				)}

				<View style={styles.body}>
					<AppText
						style={{
							fontSize: 12,
							fontWeight: "500",
							color: colors.mutedForeground + "99",
						}}
					>
						{strings.orders.orderNumber.replace("{n}", order.order_number)}
					</AppText>
					<AppText
						variant="bodyMedium"
						weight="bold"
						numberOfLines={1}
						style={styles.business}
					>
						{item.businessName}
					</AppText>
					<AppText
						style={{
							fontSize: 13,
							fontWeight: "400",
							color: colors.mutedForeground + "CC",
						}}
						numberOfLines={1}
					>
						{dateLine}
					</AppText>
					<View style={styles.badge}>
						<StatusBadge
							label={orderStatusLabels[order.status]}
							tone={orderStatusTone(order.status)}
						/>
					</View>
				</View>

				<AppText
					style={{
						fontSize: 16,
						fontWeight: "700",
						letterSpacing: -0.3,
						color: isActive ? colors.primary : colors.success,
						alignSelf: "center",
						marginRight: spacing.md,
					}}
				>
					{formatMoneyPrecise(order.price)}
				</AppText>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
	},
	row: { flexDirection: "row", alignItems: "stretch" },
	thumb: { width: 100 },
	thumbFallback: { alignItems: "center", justifyContent: "center" },
	body: {
		flex: 1,
		justifyContent: "center",
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		gap: 4,
	},
	business: { letterSpacing: -0.2 },
	badge: { paddingTop: spacing.xs },
});