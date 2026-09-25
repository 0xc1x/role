import { CircleQuestionMark } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { formatShortDate, formatTime } from "@/src/core/utils/formatters";
import type { OrderDetail } from "@/src/features/orders/domain/order";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function InstructionsCard({ item }: { item: OrderDetail }) {
	const { colors, scheme } = useTheme();
	const { order } = item;
	const completed = order.status === "completed";

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
				strings.orders.pickupStepShowCode.replace("{code}", order.pickup_code),
			);
		}
		steps.push(strings.orders.pickupStepDone);
	}

	return (
		<View style={styles.stack}>
			<Alert variant={completed ? "success" : "info"}>
				{completed ? (
					<AlertTitle>
						<AppText variant="bodyMedium" weight="bold">
							{strings.orders.instructionsCompletedTitle}
						</AppText>
					</AlertTitle>
				) : null}
				<AlertDescription>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{completed
							? strings.orders.instructionsCompletedBody
							: strings.orders.instructionsBody}
					</AppText>
				</AlertDescription>
			</Alert>

			{completed ? null : (
				<Card
					style={[
						{
							backgroundColor:
								scheme === "dark" ? colors.card : colors.background,
							borderColor: colors.borderSolid,
						},
					]}
				>
					<Accordion type="single" collapsible>
						<AccordionItem value="pickup-steps" className="border-b-0">
							<CardHeader>
								<AccordionTrigger
									className="py-0"
									accessibilityLabel={strings.orders.instructionsTitle}
								>
									<View style={styles.accordionHeaderInner}>
										<CircleQuestionMark
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
									</View>
								</AccordionTrigger>
							</CardHeader>
							<AccordionContent className="p-0">
								<CardContent style={styles.steps}>
									{steps.map((step, index) => (
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
									))}
								</CardContent>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</Card>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	stack: { gap: spacing.lg },
	accordionHeaderInner: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	accordionTitle: { flex: 1 },
	steps: { gap: spacing.xs, paddingTop: spacing.lg },
	stepRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingTop: spacing.xs,
	},
	stepText: { flex: 1, lineHeight: 18 },
});
