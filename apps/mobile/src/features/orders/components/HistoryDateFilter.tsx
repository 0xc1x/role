import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	formatDayMonth,
	getWeekRange,
	type HistoryPeriod,
} from "@/features/orders/domain/order";

export function HistoryDateFilter({
	period,
	weekOffset,
	onPeriodChange,
	onWeekChange,
}: {
	period: HistoryPeriod;
	weekOffset: number;
	onPeriodChange: (p: HistoryPeriod) => void;
	onWeekChange: (o: number) => void;
}) {
	const { colors } = useTheme();
	const { monday, sunday } = getWeekRange(new Date(), weekOffset);
	const weekLabel =
		weekOffset === 0
			? strings.orders.historyThisWeek
			: `${formatDayMonth(monday)} - ${formatDayMonth(sunday)}`;
	const isFutureWeek = weekOffset >= 0;

	return (
		<View style={styles.wrap}>
			<View style={styles.chipsRow}>
				{(
					[
						{ k: "week", l: strings.orders.historyWeek },
						{ k: "today", l: strings.orders.historyToday },
						{ k: "all", l: strings.orders.historyAll },
					] as const
				).map((c) => {
					const sel = period === c.k;
					return (
						<Pressable
							key={c.k}
							onPress={() => onPeriodChange(c.k)}
							style={[
								styles.chip,
								{
									borderColor: sel ? colors.primary : colors.borderSolid,
									backgroundColor: sel ? colors.primary : colors.card,
								},
							]}
						>
							<AppText
								variant="bodySmall"
								weight={sel ? "bold" : "regular"}
								style={{
									color: sel ? colors.primaryForeground : colors.mutedForeground,
								}}
							>
								{c.l}
							</AppText>
						</Pressable>
					);
				})}
			</View>
			{period === "week" ? (
				<View style={styles.weekRow}>
					<Pressable
						onPress={() => onWeekChange(weekOffset - 1)}
						hitSlop={8}
						style={styles.weekBtn}
					>
						<Ionicons name="chevron-back" size={18} color={colors.foreground} />
					</Pressable>
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.foreground }}
					>
						{weekLabel}
					</AppText>
					<Pressable
						onPress={() => !isFutureWeek && onWeekChange(weekOffset + 1)}
						hitSlop={8}
						style={[styles.weekBtn, isFutureWeek && { opacity: 0.3 }]}
						disabled={isFutureWeek}
					>
						<Ionicons
							name="chevron-forward"
							size={18}
							color={colors.foreground}
						/>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
	},
	chipsRow: { flexDirection: "row", gap: spacing.sm },
	chip: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
	},
	weekRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.xs,
	},
	weekBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
});
