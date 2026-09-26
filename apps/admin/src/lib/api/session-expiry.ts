/**
 * Aviso de sesión expirada.
 *
 * El cliente HTTP (`lib/api/client.ts`) no puede importar el router —sería un
 * ciclo: router → rutas → features → client— así que la app registra aquí el
 * manejador y el cliente solo notifica. Antes esto era
 * `window.location.href = "/login"`: un reload duro que tiraba la tarea en
 * curso (un motivo de rechazo a medio escribir) y dejaba un login mudo sin
 * explicar por qué el operador cayó ahí.
 */

export type SessionExpiredInfo = {
	/**
	 * Ruta donde estaba el operador, para devolverlo tras volver a entrar. Solo
	 * el pathname: el search de cada ruta tiene su propio schema y no se puede
	 * reproducir como texto sin validarlo de nuevo.
	 */
	from: string;
};

type SessionExpiredHandler = (info: SessionExpiredInfo) => void;

let handler: SessionExpiredHandler | null = null;

/** Registra el manejador de sesión expirada. Lo llama el router al crearse. */
export function setSessionExpiredHandler(next: SessionExpiredHandler | null) {
	handler = next;
}

/** Ruta actual para poder devolver al operador donde estaba. */
function currentLocation(): string {
	// `window` puede existir sin `location` (entornos no-DOM): el default keeps
	// la navegación válida en vez de romper la request que ya está fallando.
	if (typeof window === "undefined") return "/home";
	return window.location?.pathname ?? "/home";
}

/** Notifica la expiración. Sin manejador (tests, SSR) no rompe nada. */
export function notifySessionExpired() {
	handler?.({ from: currentLocation() });
}
