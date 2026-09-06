import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
import { View, StyleSheet, FlatList, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/core/theme";
import { AppText } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { strings } from "@/core/i18n/strings";
import { useCategoryStats } from "@/features/hooks";
import type { CategoryStat } from "@/features/offers/domain/offer";

interface CategoryChipsProps {
	selectedCategory: string | null;
	onCategorySelect: (categoryId: string | null) => void;
}

const INITIAL_COUNT = 5;

export function CategoryChips({
	selectedCategory,
	onCategorySelect,
}: CategoryChipsProps) {
	const { colors } = useTheme();
	const { data: stats, isLoading } = useCategoryStats();
	const [showAll, setShowAll] = useState(false);

	const allStats = useMemo<CategoryStat[]>(
		() => [
			{
				id: "all",
				name: strings.home.categoriesAll,
				count: 0,
				emoji: "",
				imageUrl: "",
			},
			...(stats ?? []),
		],
		[stats],
	);

	const displayStats = showAll ? allStats : allStats.slice(0, INITIAL_COUNT);
	const remaining = allStats.length - INITIAL_COUNT;

	const selectedId = selectedCategory === null ? "all" : selectedCategory;
	const names = useMemo(
		() => new Map(allStats.map((s) => [s.id, s.name] as const)),
		[allStats],
	);

	if (isLoading) {
		return (
			<View style={styles.loadingContainer}>
				{Array.from({ length: INITIAL_COUNT }).map((_, i) => (
					<View
						key={i}
						style={[styles.loadingChip, { backgroundColor: colors.muted }]}
					/>
				))}
			</View>
		);
	}

	const showMore = !showAll && remaining > 0;
	const showLess = showAll && remaining > 0;

	return (
		<ChipsBar
			items={displayStats.map((s) => s.id)}
			selectedId={selectedId}
			onSelect={(id) => onCategorySelect(id === "all" ? null : id)}
			labelFor={(id) => names.get(id) ?? id}
			style={styles.container}
			footer={
				showMore || showLess ? (
					<Pressable
						onPress={() => setShowAll((v) => !v)}
						style={[
							styles.moreChip,
							{ borderColor: colors.borderSolid },
						]}
					>
						<AppText
							weight="semiBold"
							style={{ color: colors.mutedForeground }}
						>
							{showMore
								? strings.home.seeMoreCategories.replace(
										"{n}",
										String(remaining),
									)
								: strings.home.seeLess}
						</AppText>
					</Pressable>
				) : null
			}
		/>
	);
}

/** Fila horizontal genérica de chips seleccionables (sin datos). */
export function ChipsBar({
	items,
	selectedId,
	onSelect,
	labelFor,
	style,
	footer,
}: {
	items: string[];
	selectedId: string;
	onSelect: (id: string) => void;
	labelFor: (id: string) => string;
	style?: StyleProp<ViewStyle>;
	footer?: ReactElement | ComponentType | null;
}) {
	return (
		<View style={style}>
			<FlatList
				data={items}
				keyExtractor={(id) => id}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				ListFooterComponent={footer ?? undefined}
				renderItem={({ item }) => (
					<AnimatedChip
						label={labelFor(item)}
						selected={item === selectedId}
						onPress={() => onSelect(item)}
					/>
				)}
			/>
		</View>
	);
}

function AnimatedChip({
	label,
	selected,
	onPress,
}: {
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);
	const prevSelected = useRef(selected);

	useEffect(() => {
		if (prevSelected.current !== selected) {
			prevSelected.current = selected;
			scale.value = 0.88;
			scale.value = withSpring(1, {
				damping: 5,
				stiffness: 180,
				mass: 0.6,
			});
		}
	}, [selected, scale]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={animatedStyle}>
			<Pressable
				onPress={onPress}
				style={[
					styles.chip,
					{
						backgroundColor: selected ? colors.greenDark : withAlpha(colors.green, 0.302),
						borderColor: selected ? colors.greenDark : withAlpha(colors.greenDark, 0.149),
					},
				]}
			>
				<AppText
					weight={selected ? "semiBold" : "medium"}
					style={{
						color: selected ? colors.green : withAlpha(colors.greenForeground, 0.565),
					}}
				>
					{label}
				</AppText>
			</Pressable>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginTop: spacing.sm,
		marginBottom: spacing.md,
	},
	listContent: {
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.xs,
		gap: spacing.sm,
		alignItems: "center",
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 40,
	},
	moreChip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 40,
	},
	loadingContainer: {
		marginTop: spacing.sm,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.xs,
		gap: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		height: 40 + spacing.xs + spacing.md,
	},
	loadingChip: {
		width: 80,
		height: 40,
		borderRadius: radii.md,
	},
});
