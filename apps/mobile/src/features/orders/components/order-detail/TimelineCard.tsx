import {
	Calendar,
	CircleCheck,
	CircleX,
	Clock,
	Timer,
	type LucideIcon,
} from "lucide-react-native";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import type { ColorTokens } from "@/src/core/theme/colors";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatShortDate, formatTime } from "@/src/core/utils/formatters";
import {
	findLastEventTime,
	type OrderStatusEvent,
	type OrderStatusType,
} from "@/src/features/orders/domain/order";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

export interface TimelineSection {
	icon: LucideIcon;
	title: string;
	note: string;
	time: string;
	color: string;
	background: string;
	filled?: boolean;
}

function formatTimestamp(iso: string): string {
	return `${formatShortDate(iso)} · ${formatTime(iso)}`;
}

function buildTimeline(
	order: Order,
	events: OrderStatusEvent[],
	colors: ColorTokens,
): TimelineSection[] {
	// Sin evento real no hay hora: "—" (nunca created_at/pickup_time como
	// hora del evento). pickup_time solo aparece como nota informativa.
	const timeOf = (statuses: OrderStatusType[]): string => {
		const iso = findLastEventTime(events, statuses);
		return iso == null ? "—" : formatTimestamp(iso);
	};
	const ready =
		order.status === "ready_for_pickup" ||
		order.status === "picked_up" ||
		order.status === "completed";

	const sections: TimelineSection[] = [
		{
			icon: CircleCheck,
			title: strings.orders.timelineConfirmed,
			note: strings.orders.timelineConfirmedNote,
			time: timeOf(["confirmed"]),
			color: colors.primary,
			background: withAlpha(colors.secondary, 0.302),
		},
	];

	if (ready) {
		sections.push({
			icon: Clock,
			title: strings.orders.timelineReady,
			note: order.pickup_time
				? `${strings.orders.timelineReadyNote} · ${strings.offers.pickupBefore.replace("{time}", formatTime(order.pickup_time))}`
				: strings.orders.timelineReadyNote,
			time: timeOf(["ready_for_pickup"]),
			color: colors.primary,
			background: withAlpha(colors.secondary, 0.302),
		});
	}

	if (order.status === "picked_up" || order.status === "completed") {
		sections.push({
			icon: CircleCheck,
			title: strings.orders.timelineCompleted,
			note: strings.orders.timelineCompletedNote,
			time: timeOf(["picked_up", "completed"]),
			color: colors.success,
			background: colors.surfaceSuccess,
			filled: true,
		});
	}

	if (order.status === "cancelled") {
		sections.push({
			icon: CircleX,
			title: strings.orders.timelineCancelled,
			note: strings.orders.timelineCancelledNote,
			time: timeOf(["cancelled"]),
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}
	if (order.status === "expired") {
		sections.push({
			icon: Timer,
			title: strings.orders.timelineExpired,
			note: strings.orders.timelineExpiredNote,
			time: timeOf(["expired"]),
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}

	return sections;
}

export function TimelineCard({
	order,
	events,
}: {
	order: Order;
	events: OrderStatusEvent[];
}) {
	const { colors, scheme } = useTheme();
	const sections = buildTimeline(order, events, colors);

	return (
		<Card
			style={{
				backgroundColor: scheme === "dark" ? colors.card : colors.background,
				borderColor: colors.borderSolid,
			}}
		>
			<Accordion type="single" collapsible>
				<AccordionItem value="timeline" className="border-b-0">
					<CardHeader>
						<AccordionTrigger
							className="py-0"
							accessibilityLabel={strings.orders.timelineTitle}
						>
							<View style={styles.timelineHeaderInner}>
								<Calendar size={20} color={colors.mutedForeground} />
								<AppText
									variant="h4"
									weight="bold"
									style={styles.timelineTitle}
								>
									{strings.orders.timelineTitle}
								</AppText>
							</View>
						</AccordionTrigger>
					</CardHeader>
					<AccordionContent className="p-0">
						<CardContent style={styles.timelineList}>
							{sections.map((section, index) => (
								<TimelineSectionRow
									key={section.title}
									section={section}
									isLast={index === sections.length - 1}
								/>
							))}
						</CardContent>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

function TimelineSectionRow({
	section,
	isLast,
}: {
	section: TimelineSection;
	isLast: boolean;
}) {
	const { colors } = useTheme();
	const Icon = section.icon;
	return (
		<View style={styles.timelineRow}>
			<View style={styles.timelineRail}>
				<View
					style={[styles.timelineDot, { backgroundColor: section.background }]}
				>
					<Icon
						size={18}
						color={section.color}
						fill={section.filled ? section.color : "none"}
					/>
				</View>
				{isLast ? null : (
					<View
						style={[styles.timelineLine, { backgroundColor: colors.border }]}
					/>
				)}
			</View>
			<View style={styles.timelineBody}>
				<AppText variant="bodyMedium" weight="bold">
					{section.title}
				</AppText>
				<AppText
					variant="bodySmall"
					style={[styles.timelineNote, { color: colors.mutedForeground }]}
				>
					{section.note}
				</AppText>
				<AppText
					variant="bodySmall"
					weight="medium"
					style={[styles.timelineTime, { color: colors.mutedForeground }]}
				>
					{section.time}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	timelineList: { paddingTop: spacing.lg, gap: spacing.sm },
	timelineHeaderInner: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	timelineTitle: { flex: 1 },
	timelineRow: { flexDirection: "row", gap: spacing.md },
	timelineRail: { alignItems: "center" },
	timelineDot: {
		width: 36,
		height: 36,
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	timelineLine: { width: 2, flex: 1, marginVertical: spacing.xs },
	timelineBody: { flex: 1, paddingBottom: spacing.lg },
	timelineNote: { lineHeight: 18 },
	timelineTime: { marginTop: spacing.xs },
});
