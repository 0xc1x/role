import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	Platform,
	Animated,
	Easing,
	Image,
	LayoutAnimation,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import {
	useCategoryStats,
	usePopularAreas,
} from "@/features/hooks";
import type { CategoryStat } from "@/features/offers/domain/offer";

const INITIAL_COUNT = 5;
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
	const { data: areas } = usePopularAreas();
	const { data: stats } = useCategoryStats();
	const [showAll, setShowAll] = useState(false);

	// IDs visibles en el frame anterior: los que NO estaban son "nuevos"
	// y deben animar su entrada (mismo patrón que `_visibleIds` en fudi).
	const visibleIds = useRef<Set<string>>(new Set());

	const display = useMemo(() => {
		const all = stats ?? [];
		return showAll ? all : all.slice(0, INITIAL_COUNT);
	}, [stats, showAll]);

	const hasMore = (stats?.length ?? 0) > INITIAL_COUNT;
	const remaining = (stats?.length ?? 0) - INITIAL_COUNT;
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
	const selectedBackground = colors.primary + "33";
	const baseText = colors.foreground;
	const mutedText = baseText + (isDark ? "99" : "80");

	const toggleExpand = () => {
		const willCollapse = showAll;
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setShowAll((s) => !s);
		if (willCollapse) onCollapse?.();
	};

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
											: colors.green + "4D",
									},
								]}
							>
								<Ionicons
									name="location-outline"
									size={14}
									color={isDark ? mutedText : colors.greenMidDark}
								/>
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{ color: isDark ? baseText : colors.greenDark + "B3" }}
								>
									{area.name}
								</AppText>
								<View
									style={[
										styles.countBadge,
										{
											backgroundColor: isDark
												? colors.primaryForeground + "1A"
												: colors.greenMidDark + "1A",
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
						<ExploreCategoryCard
							category={cat}
							isSelected={selectedCategory === cat.id}
							background={cellBackground}
							selectedBackground={selectedBackground}
							borderColor={
								selectedCategory === cat.id
									? colors.redAccent
									: colors.borderSolid
							}
							mutedText={mutedText}
							onPress={() => onCategoryTap(cat.id)}
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
								{ backgroundColor: cellBackground },
								showAll
									? { borderColor: colors.primary + "33" }
									: { borderColor: colors.primary + "26" },
							]}
						>
							<View style={[styles.expandIcon, { backgroundColor: colors.primary + "1A" }]}>
								<Ionicons
									name={showAll ? "chevron-up" : "chevron-down"}
									size={22}
									color={colors.primary}
								/>
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
	const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
	const translateY = useRef(new Animated.Value(animate ? 10 : 0)).current;

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

function ExploreCategoryCard({
	category,
	isSelected,
	background,
	selectedBackground,
	borderColor,
	mutedText,
	onPress,
}: {
	category: CategoryStat;
	isSelected: boolean;
	background: string;
	selectedBackground: string;
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
				isSelected && styles.selectedShadow,
			]}
		>
			{category.imageUrl ? (
				<View style={[styles.categoryImageWrap, { pointerEvents: "none" }]}>
					<Image
						source={{ uri: category.imageUrl }}
						style={styles.categoryImage}
						resizeMode="cover"
					/>
					<LinearGradient
						colors={["transparent", cardBackground]}
						start={{ x: 0.2, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={styles.categoryFade}
					/>
				</View>
			) : null}
			<View style={styles.categoryText}>
				<AppText variant="h4" weight="bold" numberOfLines={2}>
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
		borderRadius: 10,
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
		borderRadius: 20,
		borderWidth: 1,
		overflow: "hidden",
		justifyContent: "center",
	},
	selectedShadow: {
		boxShadow: "0px 4px 10px #FF4B4B26",
	},
	categoryImageWrap: {
		position: "absolute",
		top: 0,
		bottom: 0,
		right: 0,
		width: 100,
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
		paddingLeft: 16,
		paddingRight: 90,
	},
	expandCard: {
		height: 85,
		borderRadius: radii.lg,
		borderWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		gap: 10,
	},
	expandIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	expandText: {
		flex: 1,
	},
});