/**
 * Rutas que DOS grupos de expo-router reclaman en la misma URL.
 *
 * expo-router borra los grupos de paréntesis del path, así que el nombre de
 * una hoja dentro de un grupo ES su URL web:
 *
 *   app/(consumer)/orders.tsx  →  /orders
 *   app/(business)/orders.tsx  →  /orders
 *
 * En nativo no hay colisión: la navegación va por ruta interna (`/(business)/
 * orders` vs `/(consumer)/orders`) y cada grupo tiene su `_layout`. En web sí la
 * hay: un deep link entra por la URL desnuda y el router tiene que elegir, y
 * elige el grupo `(business)`.
 *
 * ─── Por qué el desempate NO puede vivir en el layout del grupo ──────────────
 *
 * Medido sobre el PWA exportado (`expo export` + servidor estático), cargando
 * `/orders` directo, con un negocio autenticado:
 *
 *   01 init /orders
 *   02 replace /orders         expo-router resuelve la URL al grupo (business)
 *   03 replace /management      el <Tabs> de (business), que NO tiene ruta
 *                               `index`, escribe su ruta por defecto
 *   04 APP:BusinessLayout pathname=/ segments=["(business)"]
 *
 * El guard de rol de `app/(business)/_layout.tsx` corre en 04, cuando el path ya
 * es `/management` y `useSegments()` todavía no tiene hoja: no hay forma de leer
 * ahí que el usuario pidió `/orders`. Y esperar no rescata, porque si el layout
 * devuelve algo que no sea su `<Tabs>` la anidación nunca resuelve la hoja y la
 * URL se queda clavada en `/management` (verificado: la app queda en
 * `LoadingView` para siempre).
 *
 * El guard del grupo está, por construcción, un commit TARDE que el router. Por
 * eso el desempate se resuelve en el layout raíz, que monta antes de que
 * cualquier grupo escriba en el history y donde el path sigue siendo el que
 * pidió el usuario.
 *
 * ─── Por qué la lista es explícita ─────────────────────────────────────────
 *
 * Una ruta compartida que no esté aquí no se desambigua: la gana el grupo
 * `(business)`, y un consumer que la abre aterriza en el panel de negocio (o en
 * la home, expulsado por el guard de rol). Añadir un archivo que colisione sin
 * añadirlo a este mapa reintroduce el defecto en silencio, y un comentario no
 * lo impide: `shared-routes.test.ts` lee `app/` y exige que el mapa y el árbol
 * de rutas digan exactamente lo mismo.
 */
import type { Href } from "expo-router";
import type { AppRole } from "@0xc1x/role-commons";

/** El grupo que expo-router elige cuando dos grupos reclaman la misma URL. */
export const AMBIGUOUS_ROUTE_OWNER_GROUP = "(business)";

/**
 * Path web compartido → ruta INTERNA del grupo `(consumer)` que lo sirve.
 *
 * El valor lleva el grupo a propósito: `/(consumer)/orders` y
 * `/(business)/orders` escriben la misma URL, y lo que las desambigua es el
 * grupo, no el string. Por eso la clave es el path y no la hoja.
 */
export const CONSUMER_ROUTE_FOR_SHARED_PATH: Record<string, Href> = {
	"/orders": "/(consumer)/orders",
};

/**
 * Qué hace el layout raíz con un path que dos grupos reclaman.
 *
 * - `wait`: no se puede decidir todavía (la sesión no resolvió). El layout
 *   muestra `LoadingView` y no monta el stack, que es lo que deja el path
 *   intacto para cuando se pueda.
 * - `redirect`: este viewer no es el dueño del path; se le manda a la ruta
 *   interna del grupo que sí le corresponde.
 * - `none`: no hay nada que desambiguar y el stack se monta como siempre.
 */
export type SharedRouteDecision =
	| { kind: "wait" }
	| { kind: "redirect"; href: Href }
	| { kind: "none" };

/**
 * El path que el router está sirviendo, sin query, hash ni barra final.
 *
 * `usePathname()` ya viene sin query, pero normalizar aquí hace que el mapa se
 * pueda consultar con lo que devuelve el hook y con lo que devuelve
 * `location.pathname` sin que una barra final rompa la coincidencia.
 */
export function normalizeRoutePath(pathname: string): string {
	const withoutQuery = pathname.split(/[?#]/)[0] ?? "";
	if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
		return withoutQuery.slice(0, -1);
	}
	return withoutQuery || "/";
}

/**
 * Ruta del grupo `(consumer)` que sirve `pathname`, o `null` si no está
 * compartida.
 */
export function consumerRouteForPathname(pathname: string): Href | null {
	return CONSUMER_ROUTE_FOR_SHARED_PATH[normalizeRoutePath(pathname)] ?? null;
}

/**
 * Decide a dónde va un viewer que abrió un path que dos grupos reclaman.
 *
 * ─── Por qué el grupo de `segments` es la condición de entrada ──────────────
 *
 * `/(consumer)/orders` y `/(business)/orders` escriben `/orders`, así que
 * después de redirigir el path VUELVE a ser `/orders` y el layout raíz no
 * puede distinguir "el usuario pidió /orders" de "ya lo llevé al grupo
 * consumer". Sin esta condición el redirect se realimenta en bucle (medido: el
 * replace se repite indefinidamente y la app no pinta).
 *
 * `segments[0]` sí lo distingue: el router resolved `/orders` al grupo
 * `(business)`, y después de redirigir resuelve a `(consumer)`. La condición
 * dice exactamente "mientras el router siga apuntando al grupo que ganó el
 * empate por accidente, decides tú".
 *
 * ─── Por qué sólo un `user` se redirige ─────────────────────────────────────
 *
 * `business` y `admin` son los dueños de `/orders` en su panel: sus
 * notificaciones ya apuntan ahí. Un invitado (sin sesión) no se toca: decidir
 * si puede ver pedidos es del guard de `app/index.tsx` y de las pantallas, no
 * de aquí, y mandarlo a una lista vacía sería peor que la home.
 */
export function decideSharedRoute(
	pathname: string,
	segments: readonly string[],
	viewer: { role: AppRole | undefined; sessionResolved: boolean },
): SharedRouteDecision {
	if (segments[0] !== AMBIGUOUS_ROUTE_OWNER_GROUP) return { kind: "none" };
	const href = consumerRouteForPathname(pathname);
	if (href === null) return { kind: "none" };
	if (!viewer.sessionResolved) return { kind: "wait" };
	return viewer.role === "user" ? { kind: "redirect", href } : { kind: "none" };
}
