import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export function InstructionsCard({ order }: { order: Order }) {
	const { colors } = useTheme();
	const completed = order.status === "completed";
	return (
		<Card style={styles.cardBlock}>
			<View style={styles.instructionsRow}>
				<Ionicons
					name={
						completed ? "checkmark-circle-outline" : "information-circle-outline"
					}
					size={22}
					color={completed ? colors.success : colors.primary}
				/>
				<View style={styles.instructionsBody}>
					<AppText variant="bodyMedium" weight="bold">
						{completed
							? strings.orders.instructionsCompletedTitle
							: strings.orders.instructionsTitle}
					</AppText>
					<AppText style={[styles.instructionsNote, { color: colors.mutedForeground }]}>
						{completed
							? strings.orders.instructionsCompletedBody
							: strings.orders.instructionsBody}
					</AppText>
				</View>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	cardBlock: { gap: spacing.sm },
	instructionsRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	instructionsBody: { flex: 1 },
	instructionsNote: {
		fontSize: 12,
		lineHeight: 18,
		marginTop: 2,
	},
});
