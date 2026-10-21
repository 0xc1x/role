import { env } from "@/src/core/config/env";
import { Errors } from "@/src/core/error/app-error";
import { supabase } from "@/src/core/supabase/client";

import { fromApiResponse, fromInvalidBody, fromNetworkFailure } from "./errors";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
	/** Cuerpo JSON de la petición. `undefined` = petición sin cuerpo. */
	body?: unknown;
}

/**
 * El tiempo máximo de una petición, en milisegundos.
 *
 * ─── POR QUÉ EL CLIENTE TIENE PLAZO ───────────────────────────────────────────
 *
 * Porque el cliente está en el LOGIN del consumidor: `signInWithEmail` sella
 * la sesión del staff antes de devolver, y ese sello espera al API. Una
 * conexión que se traga los paquetes —un portal cautivo, una red que se cae
 * sin avisar— dejaría la pantalla de entrada colgada PARA SIEMPRE, sin error
 * y sin forma de reintentar.
 *
 * Quince segundos son de sobra para una llamada de la API —los tiempos
 * normales son de milisegundos— y lo bastante cortos para que la persona
 * pueda volver a pulsar sin pensar que la app se quedó muerta.
 *
 * Y el plazo es del CLIENTE, no del API: el API no puede contestar a una
 * petición que no llegó.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Cliente HTTP del panel — EXCEPCIÓN CONSCIENTE a ADR-0002.
 *
 * El móvil consume Supabase directo (RLS es la frontera de datos), pero
 * ADMINISTRAR QUIÉN OPERA necesita reglas de negocio que viven en el API (el
 * tope del plan, el alcance del gerente) y que desde el cliente no se pueden
 * replicar sin mentir. La excepción está acotada a la sección de equipo del
 * panel (ADR-0013 §A.1): no se generaliza a otras consultas.
 *
 * El token sale de la sesión de supabase-js, que ya refresca solo. Este
 * cliente NO reintenta ni refresca: reintentar con el mismo token vencido
 * sólo gastaría un intento del servidor y escondería el 401 real.
 */
export async function apiRequest<T>(
	method: HttpMethod,
	path: string,
	options?: ApiRequestOptions,
): Promise<T> {
	const baseUrl = env.EXPO_PUBLIC_API_URL;
	if (!baseUrl) {
		// Faltar la URL es un error de CONFIGURACIÓN, no de la persona que
		// está usando la app: se dice con las palabras del developer y no con
		// una excusa de red.
		throw Errors.unknown("Falta EXPO_PUBLIC_API_URL");
	}

	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token) {
		throw Errors.unauthorized();
	}

	let response: Response;
	/** El cuerpo ya leído, dentro del plazo (ver el `finally`). */
	let text: string;
	// El plazo de la petición. El `AbortController` es MANUAL a propósito:
	// `AbortSignal.timeout` no existe en todas las versiones de React Native
	// que soporta la app, y un timeout que no existe deja el login colgado
	// igual de colgado.
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body:
				options?.body === undefined ? undefined : JSON.stringify(options.body),
			signal: controller.signal,
		});
		// El cuerpo también está bajo el plazo: `fetch` resuelve con las
		// CABECERAS, y un servidor que se cuelga a mitad del cuerpo dejaría a
		// quien espera colgado aunque las cabeceras hayan llegado. Un 204 no
		// tiene cuerpo y no se pide.
		text = response.status === 204 ? "" : await response.text();
	} catch (cause) {
		// Un ABORTO es un fallo de red como otro cualquiera: no llegó nada, y
		// lo que puede hacer la persona es reintentar. La taxonomía de red lo
		// dice sin inventar un motivo que el servidor no escribió.
		throw fromNetworkFailure(path, cause);
	} finally {
		// El temporizador se limpia al SETTLE, en los dos caminos: si la
		// respuesta llegó a tiempo, el temporizador sobra y no puede quedar
		// vivo pidiendo un abort sobre una petición ya terminada.
		clearTimeout(timeout);
	}

	if (!response.ok) {
		// El cuerpo va ya leído: el error se parsea dentro del mismo plazo.
		return fromApiResponse(response, path, text);
	}

	// Un 204 no tiene cuerpo: se devuelve `undefined` sin parsear (el
	// `DELETE` del API responde así). Su `text()` es vacío y no cuesta.
	if (response.status === 204) return undefined as T;

	if (!text) return undefined as T;

	try {
		return JSON.parse(text) as T;
	} catch {
		// Un 2xx con un cuerpo que no es JSON es una rotura del servidor: se
		// traduce a la taxonomía para que la UI no reciba un `SyntaxError`.
		throw fromInvalidBody(path);
	}
}

/** Los verbos del panel. El `DELETE` no lleva cuerpo: el API tampoco. */
export const api = {
	get: <T>(path: string): Promise<T> => apiRequest<T>("GET", path),
	post: <T>(path: string, body?: unknown): Promise<T> =>
		apiRequest<T>("POST", path, { body }),
	patch: <T>(path: string, body?: unknown): Promise<T> =>
		apiRequest<T>("PATCH", path, { body }),
	delete: <T>(path: string): Promise<T> => apiRequest<T>("DELETE", path),
};
