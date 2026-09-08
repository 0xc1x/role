import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	StyleSheet,
	View,
	findNodeHandle,
} from "react-native";

import { useTheme } from "@/core/theme";

// Umbrales en px (distancia de dedo, antes del factor 0.5 del indicador).
const START_SLOP = 10;
const PULL_THRESHOLD = 80;
const MAX_PULL = 140;

interface WebPullOptions {
	onRefresh: () => void;
	refreshing: boolean;
}

interface Gesture {
	startY: number;
	startX: number;
	lastDy: number;
	pulling: boolean;
	dead: boolean;
}

/**
 * Pull-to-refresh para web (PWA): `RefreshControl` es solo nativo y
 * react-native-web lo ignora. En nativo este hook no hace nada (retorna
 * `ref` nulo e `indicator` nulo) y manda el `RefreshControl` de siempre.
 *
 * Uso: `const pull = useWebPullToRefresh({ onRefresh, refreshing })`,
 * `ref={pull.ref}` en el ScrollView/FlatList y `{pull.indicator}` como
 * hermano dentro del contenedor raíz.
 */
export function useWebPullToRefresh({ onRefresh, refreshing }: WebPullOptions) {
	const { colors } = useTheme();
	const [pull, setPull] = useState(0);
	const nodeRef = useRef<HTMLElement | null>(null);
	const gestureRef = useRef<Gesture | null>(null);
	const onRefreshRef = useRef(onRefresh);
	onRefreshRef.current = onRefresh;

	const detach = useCallback(() => {
		const node = nodeRef.current;
		nodeRef.current = null;
		if (!node) return;
		node.removeEventListener("touchstart", handleTouchStart);
		node.removeEventListener("touchmove", handleTouchMove);
		node.removeEventListener("touchend", handleTouchEnd);
		node.removeEventListener("touchcancel", handleTouchEnd);
	}, []);

	const handleTouchStart = useCallback((e: TouchEvent) => {
		if (e.touches.length > 1) {
			gestureRef.current = null;
			return;
		}
		const touch = e.touches[0];
		if (!touch) return;
		gestureRef.current = {
			startY: touch.clientY,
			startX: touch.clientX,
			lastDy: 0,
			pulling: false,
			dead: false,
		};
	}, []);

	const handleTouchMove = useCallback((e: TouchEvent) => {
		const gesture = gestureRef.current;
		const node = nodeRef.current;
		if (!gesture || gesture.dead || e.touches.length > 1 || !node) return;
		const touch = e.touches[0];
		if (!touch) return;
		const dy = touch.clientY - gesture.startY;
		const dx = touch.clientX - gesture.startX;

		if (!gesture.pulling) {
			// Solo arrastre vertical hacia abajo con el scroll al tope.
			if (dy < -START_SLOP || Math.abs(dx) > Math.abs(dy) * 1.2) {
				gesture.dead = true;
				return;
			}
			if (dy < START_SLOP || node.scrollTop > 1) return;
			gesture.pulling = true;
		}
		gesture.lastDy = dy;
		if (dy <= 0) {
			setPull(0);
			return;
		}
		// preventDefault solo durante el pull: frena el rubber-band del
		// navegador sin interferir el scroll normal ni gestos horizontales.
		e.preventDefault();
		setPull(Math.min(dy * 0.5, MAX_PULL));
	}, []);

	const handleTouchEnd = useCallback(() => {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		if (!gesture || !gesture.pulling) return;
		if (gesture.lastDy * 0.5 >= PULL_THRESHOLD) {
			onRefreshRef.current();
		}
		setPull(0);
	}, []);

	const ref = useCallback(
		(instance: unknown) => {
			if (Platform.OS !== "web") return;
			detach();
			const node = resolveScrollableNode(instance);
			if (!node) return;
			nodeRef.current = node;
			node.style.overscrollBehaviorY = "contain";
			node.addEventListener("touchstart", handleTouchStart, {
				passive: true,
			});
			node.addEventListener("touchmove", handleTouchMove, {
				passive: false,
			});
			node.addEventListener("touchend", handleTouchEnd, { passive: true });
			node.addEventListener("touchcancel", handleTouchEnd, {
				passive: true,
			});
		},
		[detach, handleTouchStart, handleTouchMove, handleTouchEnd],
	);

	useEffect(() => detach, [detach]);

	const visible = refreshing || pull > 0;
	const indicator = visible ? (
		<View
			pointerEvents="none"
			style={[
				styles.indicator,
				{
					opacity: refreshing ? 1 : Math.min(1, pull / 40),
					transform: [{ translateY: refreshing ? 12 : Math.min(pull, 96) }],
				},
			]}
		>
			<View
				style={[
					styles.pill,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<ActivityIndicator size="small" color={colors.primary} />
			</View>
		</View>
	) : null;

	return { ref, indicator };
}

function resolveScrollableNode(instance: unknown): HTMLElement | null {
	if (!instance || typeof instance !== "object") return null;
	const maybe = instance as { getScrollableNode?: () => unknown };
	if (typeof maybe.getScrollableNode === "function") {
		const node = maybe.getScrollableNode();
		if (node instanceof HTMLElement) return node;
	}
	if (instance instanceof HTMLElement) return instance;
	try {
		const handle = findNodeHandle(instance as never) as unknown;
		if (handle instanceof HTMLElement) return handle;
	} catch {
		// Sin nodo DOM (nativo o ref aún no montada): sin pull web.
	}
	return null;
}

const styles = StyleSheet.create({
	indicator: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		alignItems: "center",
		paddingTop: 12,
		zIndex: 10,
	},
	pill: {
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
