/**
 * Onboarding de primera visita (guest + consumer + business).
 * Lógica pura tipada: sin storage ni UI — el storage vive en data/repository.
 */

export type OnboardingStepId = "value" | "cycle" | "entry" | "panel";

/** Audiencia del gate: decide set de pasos y destino de navegación. */
export type OnboardingAudience = "consumer" | "business" | "none";

export interface OnboardingStep {
	/** Identificador estable; el copy de cada paso vive en i18n. */
	id: OnboardingStepId;
}

/**
 * Rol → audiencia. `admin` es operador de plataforma: sin onboarding de
 * vendedor. Guest y cualquier rol desconocido caen en consumer.
 */
export function onboardingAudience(
	role: string | null | undefined,
): OnboardingAudience {
	if (role === "business") return "business";
	if (role === "admin") return "none";
	return "consumer";
}

/** Orden fijo del pager consumer (exactamente 3 pasos). */
export const CONSUMER_ONBOARDING_STEPS: readonly OnboardingStep[] = [
	{ id: "value" },
	{ id: "cycle" },
	{ id: "entry" },
];

/**
 * Orden fijo del pager business: value/cycle espejo del consumer y `panel`
 * (en vez de `entry`) para enseñar dónde viven las tres pestañas.
 */
export const BUSINESS_ONBOARDING_STEPS: readonly OnboardingStep[] = [
	{ id: "value" },
	{ id: "cycle" },
	{ id: "panel" },
];

/** Acota un índice de página al rango [0, totalPages - 1]. */
export function clampPage(index: number, totalPages: number): number {
	if (totalPages <= 0) return 0;
	return Math.min(Math.max(index, 0), totalPages - 1);
}

/**
 * Índice de página a partir del offset horizontal del pager.
 *
 * Es la única fuente de verdad del progreso cuando el avance viene de un
 * gesto: el índice se deriva del offset en cada `onScroll` (evento que sí
 * existe en nativo y en web) en vez de esperar a `onMomentumScrollEnd`, que
 * react-native-web nunca emite. El redondeo al entero más cercano hace que
 * el paso cambie al cruzar la mitad de la página, es decir, el progreso sigue
 * al dedo. Se acota con `clampPage` para que el rubber-band del borde o un
 * offset residual no dejen los puntos fuera de rango.
 */
export function pageFromOffset(
	offsetX: number,
	pageWidth: number,
	totalPages: number,
): number {
	// Sin ancho medido aún la división no es interpretable: se queda en la
	// primera página en vez de propagar NaN al estado. `NaN` en el offset
	// (RN lo emite en algunas transiciones) se filtra por la misma puerta:
	// si llegara al estado, `page` sería NaN y los puntos nunca marcarían
	// activo ni el botón mostraría "Siguiente".
	if (!(pageWidth > 0) || !Number.isFinite(offsetX)) return 0;
	return clampPage(Math.round(offsetX / pageWidth), totalPages);
}

/**
 * Prefijo versionado de la clave de storage. v1: si cambia el formato del
 * valor o el ámbito, un bump invalida las marcas viejas sin migración.
 */
export const ONBOARDING_SEEN_KEY_PREFIX = "onboarding.v1.seen";

/**
 * Clave por viewer: invitado y cada cuenta marcan por separado, así una
 * sesión nueva (o el paso de invitado a cuenta) no hereda la marca vista.
 */
export function onboardingSeenKey(
	profileId: string | null | undefined,
): string {
	return `${ONBOARDING_SEEN_KEY_PREFIX}:${profileId ?? "guest"}`;
}

/**
 * Decisión pura del gate. Solo `admin` (audiencia "none") bypasea: business
 * y consumer lo ven hasta marcarlo como visto — la pantalla elige después
 * el set de pasos según `onboardingAudience(role)`.
 */
export function shouldShowOnboarding(
	role: string | null | undefined,
	seen: boolean,
): boolean {
	if (onboardingAudience(role) === "none") return false;
	return !seen;
}
