import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import {
	PRODUCT_SORTS,
	type ProductsSort,
} from "@/features/business/domain/products";
import { SheetModal } from "../SheetModal";

const SORT_LABELS: Record<ProductsSort, string> = {
	newest: strings.business.sortNewest,
	nameAZ: strings.business.sortNameAZ,
	nameZA: strings.business.sortNameZA,
	priceLow: strings.business.sortPriceLow,
	priceHigh: strings.business.sortPriceHigh,
	stockLow: strings.business.sortStockLow,
};

/** Sort pill + bottom sheet with the six catalog orderings. */
export function ProductsSortControl({
	value,
	onChange,
}: {
	value: ProductsSort;
	onChange: (sort: ProductsSort) => void;
}) {
	const { colors } = useTheme();
	const [open, setOpen] = useState(false);

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.pill,
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.borderSolid,
						opacity: pressed ? 0.8 : 1,
					},
				]}
			>
				<Ionicons name="swap-vertical" size={14} color={colors.mutedForeground} />
				<AppText variant="bodySmall" weight="semiBold">
					{SORT_LABELS[value]}
				</AppText>
				<Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
			</Pressable>

			{open ? (
				<SheetModal title={strings.business.sort} onClose={() => setOpen(false)}>
					{PRODUCT_SORTS.map((sort) => {
						const selected = sort === value;
						return (
							<Pressable
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
									<Ionicons
										name="checkmark"
										size={18}
										color={colors.secondaryForeground}
									/>
								) : null}
							</Pressable>
						);
					})}
				</SheetModal>
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