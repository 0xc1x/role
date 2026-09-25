import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Button } from "@/components/ui/button";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import {
	formatDayMonth,
	getWeekRange,
	type HistoryPeriod,
} from "@/src/features/orders/domain/order";

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
									color: sel
										? colors.primaryForeground
										: colors.mutedForeground,
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
					<Button
						variant="ghost"
						size="icon"
						onPress={() => onWeekChange(weekOffset - 1)}
						hitSlop={8}
						aria-label={strings.orders.historyPreviousWeek}
						style={styles.weekBtn}
						icon={<ChevronLeft size={22} color={colors.foreground} />}
					/>
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.foreground }}
					>
						{weekLabel}
					</AppText>
					<Button
						variant="ghost"
						size="icon"
						onPress={() => !isFutureWeek && onWeekChange(weekOffset + 1)}
						hitSlop={8}
						style={[styles.weekBtn, isFutureWeek && { opacity: 0.3 }]}
						disabled={isFutureWeek}
						aria-label={strings.orders.historyNextWeek}
						icon={<ChevronRight size={18} color={colors.foreground} />}
					/>
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
		borderRadius: radii.lg,
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
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
});
