import { UtensilsCrossed } from "lucide-react-native";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { formatMoney } from "@/src/core/utils/formatters";
import type { OrderDetail } from "@/src/features/orders/domain/order";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ProductItemsCard({ item }: { item: OrderDetail }) {
	const { colors, scheme } = useTheme(); return (
		<Card
			style={[
				{
					backgroundColor: scheme === "dark" ? colors.card : colors.background,
					borderColor: colors.borderSolid,
				},
			]}>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1, color: colors.mutedForeground }}>
					{strings.orders.productTitle}
				</AppText>
			</CardHeader>
			<CardContent
				style={[
					styles.itemRow,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<View style={[styles.itemQty, { backgroundColor: colors.secondary }]}>
					<AppText
						variant="bodyMedium"
						weight="bold"
						style={{ color: colors.secondaryForeground }}
					>
						1
					</AppText>
				</View>
				{item.offerImageUrl ? (
					<Image
						source={{ uri: item.offerImageUrl }}
						style={styles.itemThumb}
						contentFit="cover"
					/>
				) : (
					<View
						style={[
							styles.itemThumb,
							styles.itemThumbFallback,
							{ backgroundColor: colors.muted },
						]}
					>
						<UtensilsCrossed
							size={22}
							color={colors.mutedForeground}
						/>
					</View>
				)}
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					numberOfLines={2}
					style={styles.itemTitle}
				>
					{item.offerTitle}
				</AppText>
				<AppText variant="bodyMedium" weight="bold" style={styles.itemPrice}>
					{formatMoney(item.order.price)}
				</AppText>
			</CardContent>
		</Card>
	);
}

const styles = StyleSheet.create({
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.md,
	},
	itemQty: {
		borderRadius: radii.sm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	itemThumb: {
		width: 52,
		height: 52,
		borderRadius: radii.md,
	},
	itemThumbFallback: { alignItems: "center", justifyContent: "center" },
	itemTitle: { flex: 1 },
	itemPrice: { fontVariant: ["tabular-nums"] },
});
