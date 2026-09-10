import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";

export function ReviewBanner() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.reviewBanner,
				{
					backgroundColor: withAlpha(colors.secondary, 0.149),
					borderColor: withAlpha(colors.secondary, 0.302),
				},
			]}
		>
			<Ionicons
				name="chatbubble-ellipses-outline"
				size={20}
				color={colors.primary}
			/>
			<View style={styles.reviewBannerBody}>
				<AppText variant="bodyMedium" weight="bold">
					{strings.orders.reviewBannerTitle}
				</AppText>
				<AppText style={[styles.reviewNote, { color: colors.mutedForeground }]}>
					{strings.orders.reviewBannerMessage}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	reviewBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 20,
		padding: spacing.md,
	},
	reviewBannerBody: { flex: 1 },
	reviewNote: { fontSize: 12, lineHeight: 18 },
});
