import { MessageCircle } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { Card, CardContent } from "@/components/ui/card";

export function ReviewBanner() {
	const { colors } = useTheme();
	return (
		<Card
			style={[
				{
					backgroundColor: withAlpha(colors.secondary, 0.149),
					borderColor: withAlpha(colors.secondary, 0.302),
				},
			]}
		>
			<CardContent style={styles.body}>
				<MessageCircle size={20} color={colors.primary} />
				<View style={styles.reviewBannerBody}>
					<AppText variant="bodyMedium" weight="bold">
						{strings.orders.reviewBannerTitle}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{strings.orders.reviewBannerMessage}
					</AppText>
				</View>
			</CardContent>
		</Card>
	);
}

const styles = StyleSheet.create({
	body: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	reviewBannerBody: { flex: 1 },
});
