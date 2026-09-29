import { redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getToken } from "@/lib/api/client";

/**
 * Guardias de sesión: el mismo par de reglas, evaluado en los DOS momentos en
 * que un router puede decidir.
 *
 * ─── Por qué hacen falta las dos mitades ──────────────────────────────────
 *
 * `beforeLoad` corre en el servidor y en las navegaciones del cliente, pero NO
 * cuando el router hidrata la carga inicial: confía en el match dehydrado que
 * le pasaron. Un guard que vive solo en `beforeLoad` no puede decidir sobre
 * `localStorage` en la primera carga — y el token vive justamente ahí.
 *
 * Peor: durante SSR `localStorage` no existe, así que un guard de "ruta
 * protegida" evaluado en el servidor solo puede ver "no hay token" y expulsaría
 * también al operador con sesión válida. Por eso la mitad del servidor es
 * siempre un no-op correcto, y la decisión real es la del cliente.
 *
 * Los dos hooks de abajo son esa mitad que falta. Corre en un `useEffect`, que
 * sí se ejecuta tras la hidratación, y por eso son el mecanismo y no un
 * adorno: sin ellos, un deep-link anónimo a una ruta protegida deja la pantalla
 * en blanco para siempre.
 */
function useRedirectAwayWhen(predicate: () => boolean, to: "/login" | "/home") {
	const navigate = useNavigate();
	useEffect(() => {
		if (predicate()) {
			navigate({ to });
		}
	}, [navigate, predicate, to]);
}

/**
 * Rutas que exigen sesión: sin token, el operador va al login.
 *
 * `RouteComponent` no puede resolver esto solo. `useAuthUser()` es
 * `enabled: !!getToken()`, así que sin token la query queda `enabled: false` —
 * nunca resuelve y nunca tira error — y su rama `!user` devuelve `null`, que es
 * indistinguible de "cargando". El token es la única señal que sí existe en ese
 * estado, y por eso la lee este hook.
 */
export function useRequireSession() {
	useRedirectAwayWhen(() => !getToken(), "/login");
}

/**
 * Espejo: el login es para los que no tienen sesión. Un operador autenticado que
 * llega a `/login` es expulsado al panel, porque una pantalla de login dentro de
 * un panel donde el usuario ya está dentro no es un error de navegación sino una
 * pantalla de phishing.
 */
export function useRequireGuest() {
	useRedirectAwayWhen(() => Boolean(getToken()), "/home");
}

/**
 * Guardia para redireccionar a usuarios autenticados que intentan
 * acceder a páginas de invitados (Login, Signup, etc.)
 *
 * `beforeLoad` sigue siendo la vía rápida para las navegaciones del cliente; el
 * hook `useRequireGuest` cubre la hidratación. Ambas capas comparten la misma
 * fuente de verdad (el token), no dos reglas parecidas.
 */
export const redirectIfAuthenticated = () => {
	if (typeof window !== "undefined" && getToken()) {
		throw redirect({ to: "/home" });
	}
};
