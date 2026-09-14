import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatMoney } from "@/core/utils/formatters";
import type { OrderDetail } from "@/features/orders/domain/order";

export function ProductItemsCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	return (
		<View>
			<AppText
				variant="caption"
				weight="bold"
				style={[styles.sectionLabel, { color: colors.mutedForeground }]}
			>
				{strings.orders.productTitle.toUpperCase()}
			</AppText>
			<View
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
						<Ionicons
							name="fast-food-outline"
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
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		letterSpacing: 1.2,
		marginBottom: spacing.xs,
	},
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
		paddingHorizontal: 10,
		paddingVertical: 6,
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
