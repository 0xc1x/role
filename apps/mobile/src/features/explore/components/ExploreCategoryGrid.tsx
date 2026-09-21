import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	Platform,
	Animated,
	Easing,
	LayoutAnimation,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import {
	useCategoryStats,
	usePopularAreas,
} from "@/src/features/hooks";
import type { CategoryStat } from "@/src/features/offers/domain/offer";

const INITIAL_COUNT = 4;
const ENTRY_ANIM_DURATION = 300;

/**
 * Áreas populares + grid de categorías (portado de ExploreCategoryGrid/fudi).
 * Tocar una categoría aplica el filtro y (igual que fudi) cambia a la vista de mapa.
 * Los items nuevos (o al expandir/colapsar) entran con fade + slide, como en fudi.
 */
export function ExploreCategoryGrid({
	selectedCategory,
	onCategoryTap,
	onCollapse,
}: {
	selectedCategory: string | null;
	onCategoryTap: (categoryId: string) => void;
	onCollapse?: () => void;
}) {
	const { colors, scheme } = useTheme();
	const { data: areas, isLoading: isLoadingAreas } = usePopularAreas();
	const { data: stats, isLoading: isLoadingStats } = useCategoryStats();
	const [showAll, setShowAll] = useState(false);

	// IDs visibles en el frame anterior: los que NO estaban son "nuevos"
	// y deben animar su entrada (mismo patrón que `_visibleIds` en fudi).
	const visibleIds = useRef<Set<string>>(new Set());

	const filteredStats = useMemo(
		() => (stats ?? []).filter((cat) => cat.count > 0),
		[stats],
	);

	const display = useMemo(() => {
		return showAll ? filteredStats : filteredStats.slice(0, INITIAL_COUNT);
	}, [filteredStats, showAll]);

	const hasMore = (filteredStats?.length ?? 0) > INITIAL_COUNT;
	const remaining = (filteredStats?.length ?? 0) - INITIAL_COUNT;
	const isDark = scheme === "dark";

	const currentIds = useMemo<Set<string>>(() => {
		const ids = new Set(display.map((c) => c.id));
		if (hasMore) ids.add(showAll ? "__collapse__" : "__expand__");
		return ids;
	}, [display, hasMore, showAll]);

	const newIds = useMemo<Set<string>>(() => {
		const incoming = new Set<string>();
		for (const id of currentIds) {
			if (!visibleIds.current.has(id)) incoming.add(id);
		}
		return incoming;
	}, [currentIds]);

	// Después del commit, este frame pasa a ser "visible" para el siguiente.
	useEffect(() => {
		visibleIds.current = new Set(currentIds);
	});

	const cellBackground = colors.surfaceMuted;
	const selectedBackground = withAlpha(colors.primary, 0.2);
	const selectedShadow = `0px 4px 10px ${withAlpha(colors.redAccent, 0.149)}`;
	const baseText = colors.foreground;
	const mutedText = withAlpha(baseText, isDark ? 0.6 : 0.5);

	const toggleExpand = () => {
		const willCollapse = showAll;
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setShowAll((s) => !s);
		if (willCollapse) onCollapse?.();
	};

	if (isLoadingAreas || isLoadingStats) {
		return (
			<View style={styles.container}>
				<AppText variant="h3" weight="bold">
					{strings.explore.popularAreas}
				</AppText>
				<View
					style={[
						styles.chipsRow,
						{ flexDirection: "row", marginTop: spacing.md },
					]}
				>
					{[0, 1, 2].map((i) => (
						<Skeleton
							key={`area-skeleton-${i}`}
							style={{ width: 120, height: 36, borderRadius: radii.md }}
						/>
					))}
				</View>
				<AppText variant="h3" weight="bold" style={{ marginTop: spacing.lg }}>
					{strings.explore.categories}
				</AppText>
				<View style={styles.grid}>
					{[0, 1, 2, 3].map((i) => (
						<View key={`category-skeleton-${i}`} style={styles.gridItem}>
							<Skeleton style={{ height: 85, borderRadius: radii.lg }} />
						</View>
					))}
				</View>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{/* ── Áreas Populares ────────────────────────────────────── */}
			{areas && areas.length > 0 ? (
			<>
				<AppText variant="h3" weight="bold">
					{strings.explore.popularAreas}
				</AppText>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginTop: spacing.md }}
					contentContainerStyle={styles.chipsRow}
				>
						{areas.map((area) => (
							<View
								key={area.name}
								style={[
									styles.infoChip,
									{
										backgroundColor: isDark
											? colors.surfaceMuted
											: withAlpha(colors.green, 0.302),
									},
								]}
							>
								<MapPin
									size={14}
									color={isDark ? mutedText : colors.greenMidDark}
								/>
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{ color: isDark ? baseText : withAlpha(colors.greenDark, 0.702) }}
								>
									{area.name}
								</AppText>
								<View
									style={[
										styles.countBadge,
										{
											backgroundColor: isDark
												? withAlpha(colors.primaryForeground, 0.102)
												: withAlpha(colors.greenMidDark, 0.102),
										},
									]}
								>
									<AppText
										variant="bodySmall"
										weight="semiBold"
										style={{ color: isDark ? baseText : colors.greenMidDark }}
									>
										{area.deals}
									</AppText>
								</View>
							</View>
						))}
				</ScrollView>
			</>
		) : null}

			{/* ── Grid de categorías ─────────────────────────────────── */}
			<AppText variant="h3" weight="bold" style={{ marginTop: spacing.lg }}>
				{strings.explore.categories}
			</AppText>
			<View style={styles.grid}>
				{display.map((cat) => (
					<CategoryFadeSlideIn
						key={cat.id}
						animate={newIds.has(cat.id)}
						style={styles.gridItem}
					>
						<CategoryGridItem
							category={cat}
							isSelected={selectedCategory === cat.id}
							background={cellBackground}
							selectedBackground={selectedBackground}
							selectedShadow={selectedShadow}
							borderColor={
								selectedCategory === cat.id
									? colors.redAccent
									: colors.borderSolid
							}
							mutedText={mutedText}
							onSelect={onCategoryTap}
						/>
					</CategoryFadeSlideIn>
				))}

				{hasMore ? (
					<CategoryFadeSlideIn
						key={showAll ? "__collapse__" : "__expand__"}
						animate={newIds.has(showAll ? "__collapse__" : "__expand__")}
						style={styles.gridItem}
					>
						<Pressable
							onPress={toggleExpand}
							style={[
								styles.expandCard,
								{ 
									backgroundColor: cellBackground,
									borderColor: colors.border
								},
							]}
						>
							<View style={[styles.expandIcon, { backgroundColor: withAlpha(colors.primary, 0.102) }]}>
								{showAll ? (
									<ChevronUp
										size={22}
										color={colors.primary}
									/>
								) : (
									<ChevronDown
										size={22}
										color={colors.primary}
									/>
								)}
							</View>
							<View style={styles.expandText}>
								<AppText variant="bodySmall" weight="bold">
									{showAll
										? strings.explore.seeLess
										: strings.explore.seeMoreCategories}
								</AppText>
								{!showAll ? (
									<AppText
										variant="bodySmall"
										style={{ color: mutedText, fontSize: 12 }}
									>
										{strings.explore.moreCategories.replace(
											"{n}",
											String(remaining),
										)}
									</AppText>
								) : null}
							</View>
						</Pressable>
					</CategoryFadeSlideIn>
				) : null}
			</View>
		</View>
	);
}

/**
 * Entrada animada tipo fudi (`_FadeSlideIn`): fade + slide de 10px.
 * Si `animate` es false aparece directamente en estado final (sin animar).
 */
function CategoryFadeSlideIn({
	animate,
	children,
	style,
}: {
	animate: boolean;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	// Lazy init vía useState: se crean una sola vez al montar (sin mutar
	// refs durante el render). Si `animate` es false aparecen en estado final.
	const [opacity] = useState(() => new Animated.Value(animate ? 0 : 1));
	const [translateY] = useState(() => new Animated.Value(animate ? 10 : 0));

	useEffect(() => {
		if (!animate) return;
		Animated.parallel([
			Animated.timing(opacity, {
				toValue: 1,
				duration: ENTRY_ANIM_DURATION,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: Platform.OS !== "web",
			}),
			Animated.timing(translateY, {
				toValue: 0,
				duration: ENTRY_ANIM_DURATION,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: Platform.OS !== "web",
			}),
		]).start();
	}, [animate, opacity, translateY]);

	return (
		<Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
			{children}
		</Animated.View>
	);
}

const CategoryGridItem = memo(function CategoryGridItem({
	category,
	isSelected,
	background,
	selectedBackground,
	selectedShadow,
	borderColor,
	mutedText,
	onSelect,
}: {
	category: CategoryStat;
	isSelected: boolean;
	background: string;
	selectedBackground: string;
	selectedShadow: string;
	borderColor: string;
	mutedText: string;
	onSelect: (categoryId: string) => void;
}) {
	const handlePress = useCallback(() => onSelect(category.id), [onSelect, category.id]);
	return (
		<ExploreCategoryCard
			category={category}
			isSelected={isSelected}
			background={background}
			selectedBackground={selectedBackground}
			selectedShadow={selectedShadow}
			borderColor={borderColor}
			mutedText={mutedText}
			onPress={handlePress}
		/>
	);
});

function ExploreCategoryCard({
	category,
	isSelected,
	background,
	selectedBackground,
	selectedShadow,
	borderColor,
	mutedText,
	onPress,
}: {
	category: CategoryStat;
	isSelected: boolean;
	background: string;
	selectedBackground: string;
	selectedShadow: string;
	borderColor: string;
	mutedText: string;
	onPress: () => void;
}) {
	const cardBackground = isSelected ? selectedBackground : background;
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.categoryCard,
				{
					backgroundColor: cardBackground,
					borderColor,
				},
				isSelected && { boxShadow: selectedShadow },
			]}
		>
			{category.imageUrl ? (
				<View style={[styles.categoryImageWrap, { pointerEvents: "none" }]}>
					<Image
						source={{ uri: category.imageUrl }}
						style={styles.categoryImage}
						contentFit="cover"
					/>
					<LinearGradient
						colors={["transparent", withAlpha(cardBackground, 0.85), cardBackground]}
						locations={[0, 0.55, 1]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={styles.categoryFade}
					/>
				</View>
			) : null}
			<View style={styles.categoryText}>
				<AppText variant="h4" weight="bold" numberOfLines={2}
					style={{ fontSize: 15, lineHeight: 19 }}>
					{category.name}
				</AppText>
				<AppText variant="bodySmall" style={{ color: mutedText, marginTop: 6 }}>
					{strings.explore.categoryCount.replace(
						"{n}",
						String(category.count),
					)}
				</AppText>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.lg,
	},
	chipsRow: {
		gap: spacing.sm,
	},
	infoChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: spacing.md,
		paddingVertical: 8,
		borderRadius: radii.md,
	},
	countBadge: {
		minWidth: 20,
		height: 20,
		borderRadius: radii.sm,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 5,
		marginLeft: 2,
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
	gridItem: {
		flexBasis: "48%",
		flexGrow: 1,
	},
	categoryCard: {
		height: 85,
		borderRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
		justifyContent: "center",
	},
	categoryImageWrap: {
		position: "absolute",
		top: 0,
		bottom: 0,
		right: 0,
		width: 80,
		overflow: "hidden",
	},
	categoryImage: {
		width: "100%",
		height: "100%",
	},
	categoryFade: {
		position: "absolute",
		inset: 0,
	},
	categoryText: {
		paddingLeft: 14,
		paddingRight: 72,
	},
	expandCard: {
		height: 85,
		borderRadius: radii.lg,
		borderWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	expandIcon: {
		width: 44,
		height: 44,
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	expandText: {
		flex: 1,
	},
});