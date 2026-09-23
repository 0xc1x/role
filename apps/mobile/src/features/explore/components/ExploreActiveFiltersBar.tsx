import { memo, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, FilterChip } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { useCategories } from "@/src/features/hooks";
import type { ExploreFilterState } from "@/src/features/explore/exploreTypes";

const FILTER_KEYS = ["category", "maxDistanceKm", "maxPrice", "searchQuery"] as const;
export type ActiveFilterKey = (typeof FILTER_KEYS)[number];

/**
 * Barra de chips de filtros activos con opción de limpiarlos
 * individualmente o todos (portada de ExploreActiveFiltersBar/fudi).
 */
export function ExploreActiveFiltersBar({
	filters,
	onClear,
	onClearAll,
}: {
	filters: ExploreFilterState;
	onClear: (key: ActiveFilterKey) => void;
	onClearAll: () => void;
}) {
	const { colors } = useTheme();
	const { data: categories } = useCategories();

	const categoryName =
		filters.category != null
			? categories?.find((c) => c.id === filters.category)?.name ??
				filters.category
			: null;

	const chips: Array<{ key: ActiveFilterKey; label: string }> = [];
	if (categoryName != null)
		chips.push({ key: "category", label: categoryName });
	if (filters.maxDistanceKm != null)
		chips.push({ key: "maxDistanceKm", label: `${filters.maxDistanceKm} km` });
	if (filters.maxPrice != null)
		chips.push({ key: "maxPrice", label: `Max \$${filters.maxPrice}` });
	if (filters.searchQuery.length > 0)
		chips.push({ key: "searchQuery", label: `"${filters.searchQuery}"` });

	return (
		<View style={styles.container}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.scroll}
				contentContainerStyle={styles.chips}
			>
				{chips.map((chip) => (
					<ActiveFilterChip
						key={chip.key}
						filterKey={chip.key}
						label={chip.label}
						onClear={onClear}
					/>
				))}
			</ScrollView>
			<Pressable onPress={onClearAll} hitSlop={8} accessibilityRole="button">
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.primary }}
				>
					{strings.allOffers.clear}
				</AppText>
			</Pressable>
		</View>
	);
}

const ActiveFilterChip = memo(function ActiveFilterChip({
	filterKey,
	label,
	onClear,
}: {
	filterKey: ActiveFilterKey;
	label: string;
	onClear: (key: ActiveFilterKey) => void;
}) {
	const handleClear = useCallback(() => onClear(filterKey), [onClear, filterKey]);
	return <FilterChip label={label} onClear={handleClear} />;
});

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
	},
	scroll: {
		flex: 1,
	},
	chips: {
		gap: spacing.sm,
	},
});