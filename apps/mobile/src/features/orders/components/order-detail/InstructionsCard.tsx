import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	LayoutAnimation,
	Platform,
	Pressable,
	StyleSheet,
	UIManager,
	View,
} from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import type { OrderDetail } from "@/features/orders/domain/order";

if (
	Platform.OS === "android" &&
	UIManager.setLayoutAnimationEnabledExperimental
) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Callout informativo + acordeón "Pasos para retirar".
 * Los pasos usan SOLO datos reales del OrderDetail (dirección, código,
 * horario); si un dato no existe, su paso se omite — nada se inventa.
 */
export function InstructionsCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const { order } = item;
	const completed = order.status === "completed";
	const [open, setOpen] = useState(false);

	const toggle = () => {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setOpen((v) => !v);
	};

	const steps: string[] = [];
	if (!completed) {
		steps.push(strings.orders.pickupStepWait);
		if (order.pickup_time) {
			steps.push(
				strings.orders.pickupStepWindow.replace(
					"{window}",
					`${formatShortDate(order.pickup_time)} · ${formatTime(order.pickup_time)}`,
				),
			);
		}
		if (item.businessAddress) {
			steps.push(
				strings.orders.pickupStepGoTo.replace(
					"{address}",
					item.businessAddress,
				),
			);
		}
		if (order.pickup_code) {
			steps.push(
				strings.orders.pickupStepShowCode.replace(
					"{code}",
					order.pickup_code,
				),
			);
		}
		steps.push(strings.orders.pickupStepDone);
	}

	return (
		<View style={styles.stack}>
			<Card style={styles.cardBlock}>
				<View style={styles.calloutRow}>
					<Ionicons
						name={
							completed
								? "checkmark-circle-outline"
								: "information-circle-outline"
						}
						size={22}
						color={completed ? colors.success : colors.info}
					/>
					<View style={styles.calloutBody}>
						{completed ? (
							<AppText variant="bodyMedium" weight="bold">
								{strings.orders.instructionsCompletedTitle}
							</AppText>
						) : null}
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{completed
								? strings.orders.instructionsCompletedBody
								: strings.orders.instructionsBody}
						</AppText>
					</View>
				</View>
			</Card>

			{completed ? null : (
				<Card style={styles.cardBlock}>
					<Pressable
						onPress={toggle}
						accessibilityRole="button"
						accessibilityState={{ expanded: open }}
						style={styles.accordionHeader}
					>
						<Ionicons
							name="help-circle-outline"
							size={20}
							color={colors.mutedForeground}
						/>
						<AppText
							variant="bodyMedium"
							weight="bold"
							style={styles.accordionTitle}
						>
							{strings.orders.instructionsTitle}
						</AppText>
						<Ionicons
							name={open ? "chevron-down" : "chevron-forward"}
							size={20}
							color={colors.mutedForeground}
						/>
					</Pressable>
					{open
						? steps.map((step, index) => (
								<View key={step} style={styles.stepRow}>
									<AppText
										variant="bodySmall"
										weight="bold"
										style={{ color: colors.primary }}
									>
										{`${index + 1}.`}
									</AppText>
									<AppText
										variant="bodySmall"
										style={[
											styles.stepText,
											{ color: colors.mutedForeground },
										]}
									>
										{step}
									</AppText>
								</View>
							))
						: null}
				</Card>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	stack: { gap: spacing.xl },
	cardBlock: { gap: spacing.sm },
	calloutRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	calloutBody: { flex: 1, gap: spacing.md },
	accordionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	accordionTitle: { flex: 1 },
	stepRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingTop: spacing.xs,
	},
	stepText: { flex: 1, lineHeight: 18 },
});
