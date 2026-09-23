import { create } from "zustand";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

import { filterVisibleRoutes } from "./tab-index";

export const useTabBarStore = create<{
	props: BottomTabBarProps | null;
	setProps: (props: BottomTabBarProps | null) => void;
}>((set) => ({
	props: null,
	setProps: (props) => set({ props }),
}));

export function setTabBarProps(props: BottomTabBarProps) {
	useTabBarStore.getState().setProps(props);
}

/**
 * Devuelve las props del tab bar con `state.index` sincronizado a la ruta
 * real, sin esperar la vuelta por el store.
 *
 * `TabBarCapture` escribe en el store dentro de un `useLayoutEffect`
 * (post-commit): el suscriptor (`OuterBar`) re-renderiza un commit después
 * de que la ruta ya cambió. En web ese commit extra se fusiona antes del
 * paint y no se nota; en nativo (Fabric) aterriza en frame(s) posterior(es)
 * y la píldora laguea el tab real.
 *
 * `useSegments()` en cambio se actualiza en el MISMO commit que el estado
 * del `Tabs` (misma actualización del router), así que re-derivar el índice
 * desde el segmento actual elimina el lag. Solo el índice es volátil: las
 * rutas/descriptores/navegación del snapshot son estáticos entre tabs y se
 * reutilizan tal cual.
 *
 * Sin coincidencia (push de stack sobre los tabs, checkout, pantallas fuera
 * del grupo): se devuelve el snapshot intacto para que la píldora se quede
 * quieta, igual que antes — nunca se salta al fallback por una ruta que no
 * es un tab. Excepción: segmentos que terminan en el grupo (`["(consumer)"]`)
 * significan la ruta `index` del grupo. Los deep links a rutas ocultas
 * tampoco matchean y caen en `fallbackTabName` vía `resolveActiveTabIndex`,
 * sin cambios.
 */
export function withSyncedTabIndex(
	props: BottomTabBarProps,
	segments: readonly string[],
): BottomTabBarProps {
	const visible = filterVisibleRoutes(props.state.routes, props.descriptors);
	const names = new Set(visible.map((r) => r.name));
	let match: string | undefined;
	for (let i = segments.length - 1; i >= 0; i--) {
		const segment = segments[i];
		if (segment !== undefined && names.has(segment)) {
			match = segment;
			break;
		}
	}
	if (match === undefined) {
		// La ruta `index` no aporta segmento (p. ej. `["(consumer)"]`): el tab
		// activo es el `index` del grupo, si existe entre los visibles.
		const last = segments[segments.length - 1];
		if (
			last !== undefined &&
			last.startsWith("(") &&
			last.endsWith(")") &&
			names.has("index")
		) {
			match = "index";
		} else {
			return props;
		}
	}
	const target = props.state.routes.findIndex((r) => r.name === match);
	if (target < 0 || target === props.state.index) return props;
	return { ...props, state: { ...props.state, index: target } };
}
