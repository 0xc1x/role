import { ChevronLeft } from "lucide-react-native";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, CircleIconButton, goBackOr, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import {
	isActiveStatus,
	orderStatusLabels,
	orderStatusTone,
} from "@/src/features/orders/domain/order";

export function DetailHeader({ order }: { order: Order }) {
	const { colors } = useTheme();
	return (
		<View style={styles.header}>
			<View style={styles.headerLeft}>
				<CircleIconButton
						icon={
							<ChevronLeft size={22} color={colors.foreground} />
						}
						onPress={() => goBackOr("/(consumer)")}
						accessibilityLabel={strings.common.back}
					/>
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
				dot={isActiveStatus(order.status)}
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
		borderRadius: radii.xxl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
