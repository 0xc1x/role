import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSequence,
	withTiming,
	Easing,
} from "react-native-reanimated";

import { useTheme } from "@/core/theme";
import { AppText } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
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

	const renderChip = (item: CategoryStat) => {
		const selected = item.id === selectedId;
		return (
			<AnimatedChip
				item={item}
				selected={selected}
				onPress={() => onCategorySelect(item.id === "all" ? null : item.id)}
			/>
		);
	};

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
		<View style={styles.container}>
			<FlatList
				data={displayStats}
				keyExtractor={(item) => item.id}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				ListFooterComponent={
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
				renderItem={({ item }) => renderChip(item)}
			/>
		</View>
	);
}

function AnimatedChip({
	item,
	selected,
	onPress,
}: {
	item: CategoryStat;
	selected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);
	const prevSelected = useRef(selected);

	useEffect(() => {
		if (prevSelected.current !== selected) {
			prevSelected.current = selected;
			scale.value = withSequence(
				withTiming(0.92, {
					duration: 70,
					easing: Easing.in(Easing.quad),
				}),
				withTiming(1.06, {
					duration: 65,
					easing: Easing.out(Easing.quad),
				}),
				withTiming(1, {
					duration: 45,
					easing: Easing.inOut(Easing.quad),
				}),
			);
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
						backgroundColor: selected ? colors.greenDark : colors.green + "4D",
						borderColor: selected ? colors.greenDark : colors.greenDark + "26",
					},
				]}
			>
				<AppText
					weight={selected ? "semiBold" : "medium"}
					style={{
						color: selected ? colors.green : colors.greenDark + "B3",
					}}
				>
					{item.name}
				</AppText>
			</Pressable>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
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
