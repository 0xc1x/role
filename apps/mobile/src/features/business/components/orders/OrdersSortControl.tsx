import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ArrowUpDown, Check } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import {
	ORDERS_SORTS,
	type OrdersSort,
} from "@/src/features/business/domain/orders";

const SORT_LABELS: Record<OrdersSort, string> = {
	newest: strings.business.ordersSortNewest,
	oldest: strings.business.ordersSortOldest,
};

/** Sort pill + bottom sheet (Más recientes / Más antiguos). */
export function OrdersSortControl({
	value,
	onChange,
}: {
	value: OrdersSort;
	onChange: (sort: OrdersSort) => void;
}) {
	const { colors } = useTheme();
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				icon={<ArrowUpDown size={14} color={colors.mutedForeground} />}
			>
				{SORT_LABELS[value]}
			</Button>

			{open ? (
				<BottomSheetModal title={strings.business.sort} onClose={() => setOpen(false)}>
					{ORDERS_SORTS.map((sort) => {
						const selected = sort === value;
						return (
							<Pressable
								cssInterop={false}
								key={sort}
								onPress={() => {
									onChange(sort);
									setOpen(false);
								}}
								style={({ pressed }) => [
									styles.option,
									{
										backgroundColor: selected
											? colors.secondary
											: colors.inputBackground,
										borderColor: selected ? colors.secondary : colors.borderSolid,
										opacity: pressed ? 0.85 : 1,
									},
								]}
							>
								<AppText
									variant="bodyMedium"
									weight={selected ? "semiBold" : "regular"}
									style={{
										color: selected ? colors.secondaryForeground : colors.foreground,
									}}
								>
									{SORT_LABELS[sort]}
								</AppText>
								{selected ? (
									<Check
										size={18}
										color={colors.secondaryForeground}
									/>
								) : null}
							</Pressable>
						);
					})}
				</BottomSheetModal>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	option: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
});