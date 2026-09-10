import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, goBackOr, StatusBadge } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	orderStatusLabels,
	orderStatusTone,
} from "@/features/orders/domain/order";

export function DetailHeader({ order }: { order: Order }) {
	const { colors } = useTheme();
	return (
		<View style={styles.header}>
			<View style={styles.headerLeft}>
				<Pressable
					onPress={() => goBackOr("/(consumer)/profile/orders")}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.common.back}
					style={[
						styles.headerBack,
						{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					]}
				>
					<Ionicons name="chevron-back" size={20} color={colors.foreground} />
				</Pressable>
				<View>
					<AppText variant="h3" weight="bold">
						{strings.orders.detailTitle}
					</AppText>
					<AppText style={{ color: colors.mutedForeground }}>
						{strings.orders.orderNumber.replace("{n}", order.order_number)}
					</AppText>
				</View>
			</View>
			<StatusBadge
				label={orderStatusLabels[order.status]}
				tone={orderStatusTone(order.status)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		flex: 1,
	},
	headerBack: {
		width: 40,
		height: 40,
		borderRadius: 20,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
