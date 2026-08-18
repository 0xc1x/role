import { Image, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Card,
	StatusBadge,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatDateTime, formatMoney } from "@/core/utils/formatters";
import { orderStatusLabels } from "@/features/orders/domain/order";
import { orderStatusTone } from "@/features/orders/components/OrderCard";
import { isActiveStatus } from "@/features/orders/domain/order";
import type { OrderDetail } from "@/features/orders/domain/order";
import { OrderActionButtons } from "./OrderActionButtons";

/**
 * Order list card (ported from Rolé v1 `OrderCard`): thumb, title, order
 * line, customer, created date, status, price and per-status actions.
 */
export function OrderCard({
	businessId,
	item,
}: {
	businessId: string;
	item: OrderDetail;
}) {
	const { colors } = useTheme();
	const { order } = item;
	const isActive = isActiveStatus(order.status);

	return (
		<Card
			onPress={() => router.push(`/business/${businessId}/order/${order.id}`)}
		>
			<View style={styles.body}>
				{item.offerImageUrl ? (
					<Image source={{ uri: item.offerImageUrl }} style={styles.thumb} />
				) : (
					<View style={[styles.thumb, styles.thumbPlaceholder]}>
						<Ionicons
							name="fast-food-outline"
							size={26}
							color={colors.mutedForeground}
						/>
					</View>
				)}

				<View style={styles.content}>
					<View style={styles.titleRow}>
						<AppText
							variant="h4"
							weight="bold"
							numberOfLines={2}
							style={{ flex: 1 }}
						>
							{item.offerTitle}
						</AppText>
						<AppText variant="price" style={{ color: colors.primary }}>
							{formatMoney(order.price)}
						</AppText>
					</View>

					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{strings.business.ordersOrderLine.replace("{n}", order.order_number)}
					</AppText>

					{item.customerName || item.customerPhone ? (
						<View style={styles.customerRow}>
							<AppText
								variant="labelSmall"
								numberOfLines={1}
								style={styles.customerName}
							>
								{item.customerName ?? strings.business.ordersOrderedBy}
							</AppText>
							{item.customerPhone ? (
								<View style={styles.phoneRow}>
									<Ionicons name="call-outline" size={11} color={colors.mutedForeground} />
									<AppText
										variant="bodySmall"
										numberOfLines={1}
										style={{ color: colors.mutedForeground }}
									>
										{item.customerPhone}
									</AppText>
								</View>
							) : null}
						</View>
					) : null}

					<View style={styles.bottomRow}>
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
							{formatDateTime(order.created_at)}
						</AppText>
						<StatusBadge
							label={orderStatusLabels[order.status]}
							tone={orderStatusTone(order.status)}
						/>
					</View>
				</View>
			</View>

			{isActive ? (
				<>
					<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					<OrderActionButtons businessId={businessId} item={item} />
				</>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	body: {
		flexDirection: "row",
		gap: spacing.md,
	},
	thumb: {
		width: 76,
		height: 76,
		borderRadius: radii.lg,
	},
	thumbPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#E5E5E5",
	},
	content: {
		flex: 1,
		gap: 2,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	customerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 2,
	},
	customerName: { flexShrink: 1 },
	phoneRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		marginTop: 4,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: spacing.md,
	},
});