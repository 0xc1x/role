import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

import { useTheme } from "@/core/theme";
import { radii } from "@/core/theme/spacing";
import { AppText } from "@/core/ui";
import { setTabBarProps } from "./tabbar-store";

export const BAR_HEIGHT = 64;
const DURATION_MS = 400;
const HALF_MS = DURATION_MS / 2;
const STRETCH_FACTOR = 0.18;
const MAX_WIDTH = 480;

type TabBarStyleOption = {
	display?: string;
};

function isTabHidden(style: unknown): boolean {
	if (!style) return false;
	const target = Array.isArray(style) ? style : [style];
	return target.some(
		(s) => (s as TabBarStyleOption | null | undefined)?.display === "none",
	);
}

/**
 * Barra de pestañas inferior de Rolé.
 *
 * Tres capas sobre un Stack:
 * 1. Iconos muted siempre visibles (inactivos = solo icono).
 * 2. Píldora oscura que se desliza y se estira en el recorrido
 *    (estiramiento 0→1→0 en la primera/segunda mitad del viaje).
 * 3. Ventana máscara que "revela" icono + label clavados a la pantalla
 *    (el contenido no se mueve: la píldora pasa por encima).
 */
export default function RoleTabBar(props: BottomTabBarProps) {
	const { colors } = useTheme();
	const insets = props.insets;

	const barKey = `${props.state.index}:${props.state.routes.map((r) => r.key).join("|")}`;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setTabBarProps(props), [barKey]);

	const [measuredWidth, setMeasuredWidth] = useState(0);

	const left = useRef(new Animated.Value(0)).current;
	const stretch = useRef(new Animated.Value(0)).current;
	const origin = useRef(new Animated.Value(0)).current;
	const initialized = useRef(false);

	const routes = useMemo(
		() =>
			props.state.routes.filter(
				(route) =>
					!isTabHidden(
						props.descriptors[route.key]?.options.tabBarItemStyle,
					),
			),
		[props.state.routes, props.descriptors],
	);

	const currentIndex = Math.max(
		0,
		routes.findIndex(
			(r) => r.key === props.state.routes[props.state.index]?.key,
		),
	);
	const barWidth = Math.min(measuredWidth, MAX_WIDTH);
	const itemWidth = routes.length > 0 ? barWidth / routes.length : 0;
	const pillWidth = itemWidth * 0.8;

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

	// Anima la píldora hacia el tab activo (easeInOutCubic + stretch 0→1→0).
	useEffect(() => {
		if (routes.length === 0 || barWidth <= 0) return;
		const target = currentIndex * itemWidth + (itemWidth - pillWidth) / 2;

		if (!initialized.current) {
			initialized.current = true;
			left.setValue(target);
			stretch.setValue(0);
			return;
		}

		const leftAnim = Animated.timing(left, {
			toValue: target,
			duration: DURATION_MS,
			easing: Easing.inOut(Easing.cubic),
			useNativeDriver: false,
		});
		const stretchAnim = Animated.sequence([
			Animated.timing(stretch, {
				toValue: 1,
				duration: HALF_MS,
				easing: Easing.out(Easing.ease),
				useNativeDriver: false,
			}),
			Animated.timing(stretch, {
				toValue: 0,
				duration: HALF_MS,
				easing: Easing.in(Easing.ease),
				useNativeDriver: false,
			}),
		]);
		Animated.parallel([leftAnim, stretchAnim]).start();
	}, [currentIndex, barWidth, itemWidth, pillWidth, routes.length, left, stretch]);

	const stretchExtra = useMemo(
		() => Animated.multiply(STRETCH_FACTOR * pillWidth, stretch),
		[pillWidth, stretch],
	);
	const animatedPillWidth = useMemo(
		() => Animated.add(pillWidth, stretchExtra),
		[pillWidth, stretchExtra],
	);
	const animatedLeft = useMemo(
		() => Animated.subtract(left, Animated.divide(stretchExtra, 2)),
		[left, stretchExtra],
	);
	// Compensa el movimiento (incluido el estiramiento) de la ventana para
	// mantener el contenido fijo a pantalla, sin deformarlo.
	const pinOffset = useMemo(
		() =>
			Animated.add(
				Animated.subtract(origin, left),
				Animated.divide(stretchExtra, 2),
			),
		[origin, left, stretchExtra],
	);

	return (
		<View
			onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
			style={[
				styles.bar,
				{
					backgroundColor: colors.background,
					borderTopColor: colors.borderSolid,
					paddingBottom: insets.bottom,
					zIndex: 1100,
				},
			]}
		>
			<View style={styles.barInner}>
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
								? icon({ color: colors.mutedForeground, size: 28, focused: false })
								: null}
						</Pressable>
					);
				})}

				<Animated.View
					pointerEvents="none"
					style={[
						styles.pill,
						{
							backgroundColor: colors.foreground,
							left: animatedLeft,
							width: animatedPillWidth,
						},
					]}
				>
					<Animated.View
						style={[
							styles.pillContent,
							{ width: barWidth, transform: [{ translateX: pinOffset }] },
						]}
					>
						{routes.map((route, index) => {
							const options = props.descriptors[route.key]?.options;
							const icon = options?.tabBarIcon;
							return (
								<View key={route.key} style={styles.pillItem}>
									{icon
										? icon({ color: colors.background, size: 24, focused: true })
										: null}
									<AppText
										variant="bodyMedium"
										weight="medium"
										color={colors.background}
										numberOfLines={1}
									>
										{labelFor(options, route.name)}
									</AppText>
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