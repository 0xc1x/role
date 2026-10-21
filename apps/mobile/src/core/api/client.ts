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
		});
	} catch (cause) {
		throw fromNetworkFailure(path, cause);
	}

	if (!response.ok) {
		return fromApiResponse(response, path);
	}

	// Un 204 no tiene cuerpo: se devuelve `undefined` sin parsear (el
	// `DELETE` del API responde así).
	if (response.status === 204) return undefined as T;

	const text = await response.text();
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
