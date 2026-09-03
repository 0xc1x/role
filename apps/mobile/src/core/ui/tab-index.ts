/**
 * Lógica pura de la barra de pestañas: qué tab visible resaltar.
 *
 * Los tabs ocultos (`href: null` en Expo Router) generan
 * `tabBarItemStyle: { display: "none" }` y NO deben mostrarse en la barra.
 * `filterVisibleRoutes` los excluye; `resolveActiveTabIndex` resalta el tab
 * visible activo, con `fallbackTabName` como red de seguridad para deep links.
 *
 * No se usa `state.history`: el TabRouter de Expo Router reconstruye el
 * historial según `backBehavior` y podría no reflejar el tab desde el que
 * se navegó.
 */

export type TabRouteLike = {
	key: string;
	name: string;
};

export type TabStateLike = {
	index: number;
	routes: TabRouteLike[];
};

type DescriptorLike = {
	options?: { tabBarItemStyle?: unknown };
};

type TabBarStyleOption = {
	display?: string;
};

export function isTabHidden(style: unknown): boolean {
	if (!style) return false;
	const target = Array.isArray(style) ? style : [style];
	return target.some(
		(s) => (s as TabBarStyleOption | null | undefined)?.display === "none",
	);
}

/** Rutas que se muestran en la barra (excluye tabs con `href: null`). */
export function filterVisibleRoutes(
	routes: readonly TabRouteLike[],
	descriptors: Record<string, DescriptorLike | undefined>,
): TabRouteLike[] {
	return routes.filter(
		(route) => !isTabHidden(descriptors[route.key]?.options?.tabBarItemStyle),
	);
}

/**
 * Índice (sobre las rutas visibles) a resaltar.
 * - Ruta activa visible → su índice.
 * - Ruta activa no visible (deep link) → `fallbackTabName` si existe; último
 *   recurso: 0.
 */
export function resolveActiveTabIndex(
	state: TabStateLike,
	visibleRoutes: readonly TabRouteLike[],
	fallbackTabName?: string,
): number {
	const activeRoute = state.routes[state.index];
	const visibleIndex = visibleRoutes.findIndex(
		(r) => r.key === activeRoute?.key,
	);
	if (visibleIndex >= 0) return visibleIndex;

	if (fallbackTabName) {
		const idx = visibleRoutes.findIndex((r) => r.name === fallbackTabName);
		if (idx >= 0) return idx;
	}
	return 0;
}
