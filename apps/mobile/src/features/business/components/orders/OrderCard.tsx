import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import { CardPressable } from "@/components/ui/card-presable";
import { AppText, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { typography } from "@/src/core/theme/typography";
import { formatDateTime, formatMoney } from "@/src/core/utils/formatters";
import { orderStatusLabels, orderStatusTone } from "@/src/features/orders/domain/order";
import type { OrderDetail } from "@/src/features/orders/domain/order";
import { OrderActionButtons } from "./OrderActionButtons";

/** Business order card: inset thumb, title + price row, order line, customer,
 * date + status row, divider and per-status actions. Same structure in both
 * themes; only color tokens change. */
export function OrderCard({
	businessId,
	item,
}: {
	businessId: string;
	item: OrderDetail;
}) {
	const { colors } = useTheme();
	const { order } = item;
	const hasActions = ["pending", "confirmed", "ready_for_pickup"].includes(order.status);

	return (
		<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
			<CardPressable
				className="p-0 gap-0 border-0 shadow-none"
				style={{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				}}
				onPress={() => router.push(`/business/${businessId}/order/${order.id}`)}
			>
				<View style={styles.body}>
					{item.offerImageUrl ? (
						<Image
							source={{ uri: item.offerImageUrl }}
							style={styles.thumb}
							contentFit="cover"
						/>
					) : (
						<View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.borderSolid }]}>
							<UtensilsCrossed
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

						{item.customerName ? (
							<View style={styles.customerRow}>
								<AppText
									variant="labelSmall"
									numberOfLines={1}
									style={styles.customerName}
								>
									{item.customerName}
								</AppText>
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
			</CardPressable>

			{hasActions ? (
				<>
					<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					<OrderActionButtons businessId={businessId} item={item} />
				</>
			) : null}
		</View>
	);
}

export function OrderCardSkeleton({ active = true }: { active?: boolean }) {
	const { colors } = useTheme();
	return (
		<View
			accessible
			accessibilityLabel={strings.common.loading}
			accessibilityState={{ busy: true }}
			testID="business-order-skeleton"
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<View style={styles.body}>
				<Skeleton style={styles.thumb} />
				<View style={styles.content}>
					<View style={styles.titleRow}>
						<View style={{ flex: 1 }}>
							<Skeleton style={{ height: typography.h4.lineHeight }} />
							<Skeleton style={{ height: typography.h4.lineHeight, width: "70%" }} />
						</View>
						<Skeleton style={{ width: "30%", height: typography.price.fontSize * 1.4 }} />
					</View>
					<Skeleton style={{ height: typography.bodySmall.lineHeight, width: "65%" }} />
					<View style={styles.customerRow}>
						<Skeleton style={{ height: typography.labelSmall.fontSize * 1.4, width: "80%" }} />
					</View>
					<View style={styles.bottomRow}>
						<Skeleton style={{ height: typography.bodySmall.lineHeight, flex: 1 }} />
						<Skeleton style={styles.skeletonBadge} />
					</View>
				</View>
			</View>
			{active ? (
				<View testID="order-actions-skeleton">
					<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					<Skeleton style={styles.skeletonAction} />
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.xl,
		borderWidth: 1,
		padding: spacing.lg,
		overflow: "hidden",
	},
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
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: spacing.md,
	},
	// Match the action button's minimum touch target without mounting a mutation.
	skeletonAction: {
		minHeight: 44,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
	},
	skeletonBadge: {
		height: 22,
		width: 72,
		borderRadius: radii.pill,
	},
});
