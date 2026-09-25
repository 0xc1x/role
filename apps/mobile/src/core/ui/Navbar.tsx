import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/src/core/theme";
import { radii } from "@/src/core/theme/spacing";
import { AppText } from "./AppText";
import { filterVisibleRoutes, resolveActiveTabIndex } from "./tab-index";

export const BAR_HEIGHT = 64;
const DURATION_MS = 380;
const HALF_MS = DURATION_MS / 2;
const STRETCH_FACTOR = 0.18;
const MAX_WIDTH = 480;
const COMPACT_ITEM_WIDTH = 112;

type NavbarProps = BottomTabBarProps & {
	fallbackTabName?: string;
};

export default function Navbar({ fallbackTabName, ...props }: NavbarProps) {
	const { colors } = useTheme();
	const safeInsets = useSafeAreaInsets();
	const bottomInset = Math.max(safeInsets.bottom, props.insets.bottom ?? 0);

	const paddingBottom = Platform.select({
		// SAFETY: web accepts CSS lengths; native receives only the numeric inset.
		web: `max(${bottomInset}px, env(safe-area-inset-bottom, 0px))` as unknown as number,
		default: bottomInset,
	});

	const [measuredWidth, setMeasuredWidth] = useState(0);

	const left = useSharedValue(0);
	const stretch = useSharedValue(0);
	const initialized = useSharedValue(false);

	const routes = useMemo(
		() => filterVisibleRoutes(props.state.routes, props.descriptors),
		[props.state.routes, props.descriptors],
	);

	const currentIndex = resolveActiveTabIndex(
		props.state,
		routes,
		fallbackTabName,
	);

	const barWidth = Math.min(measuredWidth, MAX_WIDTH);
	const itemWidth = routes.length > 0 ? barWidth / routes.length : 0;
	const pillWidth = itemWidth * 0.8;
	const compact = itemWidth > 0 && itemWidth < COMPACT_ITEM_WIDTH;

	const onTab = useCallback(
		(index: number) => {
			const route = routes[index];
			if (!route) return;

			const event = props.navigation.emit({
				type: "tabPress",
				target: route.key,
				canPreventDefault: true,
			});

			if (!event.defaultPrevented) {
				props.navigation.navigate(route.name);
			}
		},
		[routes, props.navigation],
	);

	// Animación de la píldora
	useEffect(() => {
		if (routes.length === 0 || barWidth <= 0 || itemWidth <= 0) return;

		const target = currentIndex * itemWidth + (itemWidth - pillWidth) / 2;

		if (!initialized.value) {
			initialized.value = true;
			left.value = target;
			stretch.value = 0;
			return;
		}

		cancelAnimation(left);
		cancelAnimation(stretch);

		left.value = withTiming(target, {
			duration: DURATION_MS,
			easing: Easing.inOut(Easing.cubic),
		});

		stretch.value = withSequence(
			withTiming(1, {
				duration: HALF_MS,
				easing: Easing.out(Easing.ease),
			}),
			withTiming(0, {
				duration: HALF_MS,
				easing: Easing.in(Easing.ease),
			}),
		);
	}, [
		currentIndex,
		barWidth,
		itemWidth,
		pillWidth,
		routes.length,
		initialized,
		left,
		stretch,
	]);

	const pillStyle = useAnimatedStyle(() => {
		const stretchExtra = STRETCH_FACTOR * pillWidth * stretch.value;
		return {
			left: left.value - stretchExtra / 2,
			width: pillWidth + stretchExtra,
		};
	}, [pillWidth]);

	// Contenido fijo a pantalla → la píldora solo “revela”
	const contentStyle = useAnimatedStyle(() => {
		const stretchExtra = STRETCH_FACTOR * pillWidth * stretch.value;
		return {
			transform: [{ translateX: -left.value + stretchExtra / 2 }],
		};
	}, [pillWidth]);

	return (
		<View
			onLayout={(e) => {
				const width = e.nativeEvent.layout.width;
				if (width > 0 && Math.abs(width - measuredWidth) > 0.5) {
					setMeasuredWidth(width);
				}
			}}
			style={[
				styles.bar,
				{
					backgroundColor: colors.background,
					borderTopColor: colors.borderSolid,
					paddingBottom,
					zIndex: 1100,
				},
			]}
		>
			<View style={styles.barInner}>
				{/* Capa 1: iconos muted */}
				{routes.map((route, index) => {
					const options = props.descriptors[route.key]?.options;
					const icon = options?.tabBarIcon;

					return (
						<Pressable
							key={route.key}
							onPress={() => onTab(index)}
							accessibilityRole="button"
							accessibilityLabel={labelFor(options, route.name)}
							style={styles.item}
						>
							{icon
								? icon({
										color: colors.mutedForeground,
										size: 28,
										focused: false,
									})
								: null}
						</Pressable>
					);
				})}

				{/* Capa 2 + 3: píldora + fila completa (efecto reveal) */}
				<Animated.View
					pointerEvents="none"
					style={[
						styles.pill,
						{ backgroundColor: colors.foreground },
						pillStyle,
					]}
				>
					<Animated.View
						style={[styles.pillContent, { width: barWidth || 1 }, contentStyle]}
					>
						{routes.map((route) => {
							const options = props.descriptors[route.key]?.options;
							const icon = options?.tabBarIcon;

							return (
								<View key={route.key} style={styles.pillItem}>
									{icon
										? icon({
												color: colors.background,
												size: 24,
												focused: true,
											})
										: null}
									{compact ? null : (
										<AppText
											variant="bodyMedium"
											weight="medium"
											color={colors.background}
											numberOfLines={1}
										>
											{labelFor(options, route.name)}
										</AppText>
									)}
								</View>
							);
						})}
					</Animated.View>
				</Animated.View>
			</View>
		</View>
	);
}

function labelFor(
	options: { tabBarLabel?: unknown; title?: string } | undefined,
	fallback: string,
): string {
	if (typeof options?.tabBarLabel === "string") return options.tabBarLabel;
	return options?.title ?? fallback;
}

const styles = StyleSheet.create({
	bar: {
		borderTopWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
	},
	barInner: {
		width: "100%",
		maxWidth: MAX_WIDTH,
		height: BAR_HEIGHT,
		flexDirection: "row",
	},
	item: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	pill: {
		position: "absolute",
		top: 12,
		bottom: 12,
		borderRadius: radii.md,
		overflow: "hidden",
	},
	pillContent: {
		position: "absolute",
		top: -12,
		left: 0,
		height: BAR_HEIGHT,
		flexDirection: "row",
	},
	pillItem: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
});
