import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import type { ColorTokens } from "@/core/theme/colors";
import { spacing } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import {
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import {
	lastEventTimeFor,
	type OrderStatusEvent,
	type OrderStatusType,
} from "@/features/orders/domain/order";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface TimelineSection {
	icon: IoniconName;
	title: string;
	note: string;
	time: string;
	color: string;
	background: string;
}

function formatTimestamp(iso: string): string {
	return `${formatShortDate(iso)} · ${formatTime(iso)}`;
}

function buildTimeline(
	order: Order,
	events: OrderStatusEvent[],
	colors: ColorTokens,
): TimelineSection[] {
	// Fallbacks en ISO; `lastEventTimeFor` devuelve ISO (evento o fallback)
	// y `formatTimestamp` formatea una única vez para pantalla.
	const createdIso = order.created_at;
	const readyIso = order.pickup_time ?? createdIso;
	const timeOf = (statuses: OrderStatusType[], fallback: string) =>
		formatTimestamp(lastEventTimeFor(events, statuses, fallback));
	const ready =
		order.status === "ready_for_pickup" ||
		order.status === "picked_up" ||
		order.status === "completed";

	const sections: TimelineSection[] = [
		{
			icon: "checkmark-circle-outline",
			title: strings.orders.timelineConfirmed,
			note: strings.orders.timelineConfirmedNote,
			time: timeOf(["confirmed"], createdIso),
			color: colors.primary,
			background: withAlpha(colors.secondary, 0.302),
		},
	];

	if (ready) {
		sections.push({
			icon: "time-outline",
			title: strings.orders.timelineReady,
			note: strings.orders.timelineReadyNote,
			time: timeOf(["ready_for_pickup"], readyIso),
			color: colors.primary,
			background: withAlpha(colors.secondary, 0.302),
		});
	}

	if (order.status === "picked_up" || order.status === "completed") {
		sections.push({
			icon: "checkmark-circle",
			title: strings.orders.timelineCompleted,
			note: strings.orders.timelineCompletedNote,
			time: timeOf(["picked_up", "completed"], readyIso),
			color: colors.success,
			background: colors.surfaceSuccess,
		});
	}

	if (order.status === "cancelled") {
		sections.push({
			icon: "close-circle-outline",
			title: strings.orders.timelineCancelled,
			note: strings.orders.timelineCancelledNote,
			time: timeOf(["cancelled"], createdIso),
			color: colors.destructive,
			background: colors.destructiveSurface,
		});
	}
	if (order.status === "expired") {
		sections.push({
			icon: "timer-outline",
			title: strings.orders.timelineExpired,
			note: strings.orders.timelineExpiredNote,
			time: timeOf(["expired"], createdIso),
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
	const { colors } = useTheme();
	const sections = buildTimeline(order, events, colors);
	return (
		<Card style={styles.cardBlock}>
			<View style={styles.timelineHeader}>
				<Ionicons name="calendar-outline" size={20} color={colors.primary} />
				<AppText variant="h4" weight="bold">
					{strings.orders.timelineTitle}
				</AppText>
			</View>
			{sections.map((section, index) => (
				<TimelineSectionRow
					key={section.title}
					section={section}
					isLast={index === sections.length - 1}
				/>
			))}
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
	return (
		<View style={styles.timelineRow}>
			<View style={styles.timelineRail}>
				<View
					style={[
						styles.timelineDot,
						{ backgroundColor: section.background },
					]}
				>
					<Ionicons name={section.icon} size={18} color={section.color} />
				</View>
				{isLast ? null : (
					<View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
				)}
			</View>
			<View style={styles.timelineBody}>
				<AppText variant="bodyMedium" weight="bold">
					{section.title}
				</AppText>
				<AppText style={[styles.timelineNote, { color: colors.mutedForeground }]}>
					{section.note}
				</AppText>
				<AppText style={[styles.timelineTime, { color: colors.mutedForeground }]}>
					{section.time}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	cardBlock: { gap: spacing.sm },
	timelineHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	timelineRow: { flexDirection: "row", gap: spacing.md },
	timelineRail: { alignItems: "center" },
	timelineDot: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	timelineLine: { width: 2, flex: 1, marginVertical: spacing.xs },
	timelineBody: { flex: 1, paddingBottom: spacing.lg },
	timelineNote: { fontSize: 12, lineHeight: 18 },
	timelineTime: { fontSize: 12, marginTop: 4, fontWeight: "500" },
});
