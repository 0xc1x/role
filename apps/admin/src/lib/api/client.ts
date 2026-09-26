import { env } from "@/config/env";
import { ApiClientError, throwFromResponse } from "./errors";
import { notifySessionExpired } from "./session-expiry";

const KEYS = {
	token: "role_admin_auth_token",
	expiresAt: "role_admin_token_expires_at",
} as const;

/** El login explica la caída; este mensaje es el fallback si algo lo muestra. */
const SESSION_EXPIRED = "Tu sesión expiró. Inicia sesión de nuevo.";

function getStorage(): Storage | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return localStorage;
	} catch {
		return undefined;
	}
}

function getItem(key: string): string | null {
	const s = getStorage();
	if (!s) return null;
	try {
		return s.getItem(key);
	} catch {
		return null;
	}
}

/**
 * `setItem` nunca lanza: un fallo de escritura no puede tumbar la mutación que
 * ya se aplicó en el servidor. Devuelve si el dato quedó, para que el camino de
 * auth pueda avisar en vez de perder la sesión en silencio.
 */
function setItem(key: string, value: string | null): boolean {
	const s = getStorage();
	if (!s) return false;
	try {
		if (value) s.setItem(key, value);
		else s.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

export const getToken = () => getItem(KEYS.token);
export const setToken = (v: string | null) => setItem(KEYS.token, v);
export const getTokenExpiresAt = () => getItem(KEYS.expiresAt);
export const setTokenExpiresAt = (v: string | null) =>
	setItem(KEYS.expiresAt, v);

export function clearAuth() {
	const s = getStorage();
	if (!s) return;
	try {
		for (const k of Object.values(KEYS)) s.removeItem(k);
	} catch {}
}

/** Clave del sonda: fuera de `KEYS` para que `clearAuth` no la confunda. */
const PROBE_KEY = "role_admin_storage_probe";

/**
 * Sondea si el navegador deja persistir la sesión: escribe, relee y borra, en
 * vez de preguntar por la existencia de `localStorage`. Safari privado, la
 * cuota agotada e iOS ITP dejan el objeto disponible y la escritura falla.
 *
 * POR QUÉ IMPORTA: los helpers de storage son fail-safe a propósito, así que un
 * `localStorage` que lanza produce un panel que parecelogueado y pierde la
 * sesión en cada recarga sin decir nada. Esto convierte ese fallo silencioso en
 * un aviso al operador. Nunca lanza: informa.
 */
export function isStoragePersistent(): boolean {
	const s = getStorage();
	if (!s) return false;
	try {
		s.setItem(PROBE_KEY, "1");
		const written = s.getItem(PROBE_KEY) === "1";
		s.removeItem(PROBE_KEY);
		return written;
	} catch {
		return false;
	}
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * El refresh token vive en una cookie httpOnly (features/auth/server.ts): el
 * cliente no puede leerlo, solo pedir la rotación vía server function.
 */
async function attemptTokenRefresh(): Promise<boolean> {
	if (isRefreshing && refreshPromise) {
		return refreshPromise;
	}

	isRefreshing = true;
	refreshPromise = (async () => {
		try {
			const { refreshFn } = await import("@/features/auth/server");
			const session = await refreshFn();
			if (!session) {
				clearAuth();
				return false;
			}
			setToken(session.access_token);
			setTokenExpiresAt(session.expires_at);
			return true;
		} catch {
			clearAuth();
			return false;
		} finally {
			isRefreshing = false;
			refreshPromise = null;
		}
	})();

	return refreshPromise;
}

function isTokenExpired(): boolean {
	const expiresAt = getTokenExpiresAt();
	if (!expiresAt) return false;
	const expTime = new Date(expiresAt).getTime();
	return Date.now() >= expTime - 5 * 60 * 1000;
}

function buildHeaders(
	formData?: FormData,
	token?: string | null,
): Record<string, string> {
	const h: Record<string, string> = {};
	if (!formData) h["Content-Type"] = "application/json";
	if (token) h.Authorization = `Bearer ${token}`;
	return h;
}

function buildBody(opts?: {
	body?: unknown;
	formData?: FormData;
}): BodyInit | undefined {
	if (opts?.formData) return opts.formData;
	if (opts?.body) return JSON.stringify(opts.body);
	return undefined;
}

/**
 * Lee el cuerpo tolerando respuestas vacías. Los endpoints `void` (p. ej.
 * `DELETE /offers/:id`, que desactiva la oferta) contestan 200 sin cuerpo, y
 * `res.json()` sobre "" lanza SyntaxError: la mutación reportaría fallo DESPUÉS
 * de haber aplicado el cambio. Un cuerpo no vacío se parsea igual que antes.
 *
 * El `text()` primero es justamente para poder distinguir "cuerpo vacío" de
 * "cuerpo con contenido"; si el objeto de respuesta no lo implementa (stubs y
 * polyfills), se cae a `json()`.
 */
async function parseBody<T>(res: Response): Promise<T> {
	if (typeof res.text === "function") {
		const text = await res.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}
	return res.json() as Promise<T>;
}

async function request<T>(
	method: string,
	path: string,
	options?: { body?: unknown; skipAuth?: boolean; formData?: FormData },
): Promise<T> {
	if (options?.skipAuth) {
		const res = await fetch(`${env.VITE_API_URL}${path}`, {
			method,
			headers: buildHeaders(options.formData),
			body: buildBody(options),
		});
		if (!res.ok) return throwFromResponse(res);
		return parseBody<T>(res);
	}

	if (isTokenExpired()) {
		const refreshed = await attemptTokenRefresh();
		if (!refreshed) {
			clearAuth();
			notifySessionExpired();
			throw new ApiClientError({ status: 401, message: SESSION_EXPIRED });
		}
	}

	const token = getToken();
	const headers = buildHeaders(options?.formData, token);
	const body = buildBody(options);
	const response = await fetch(`${env.VITE_API_URL}${path}`, {
		method,
		headers,
		body,
	});

	if (response.status !== 401) {
		if (!response.ok) return throwFromResponse(response);
		return parseBody<T>(response);
	}

	const refreshed = await attemptTokenRefresh();
	if (refreshed) {
		const newToken = getToken();
		if (newToken) headers.Authorization = `Bearer ${newToken}`;
		const retry = await fetch(`${env.VITE_API_URL}${path}`, {
			method,
			headers,
			body,
		});
		if (retry.ok) return parseBody<T>(retry);
		if (!retry.ok) return throwFromResponse(retry);
	}
	clearAuth();
	notifySessionExpired();
	throw new ApiClientError({ status: 401, message: SESSION_EXPIRED });
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(
		path: string,
		body?: unknown,
		opts?: { skipAuth?: boolean; formData?: FormData },
	) => request<T>("POST", path, { body, ...opts }),
	patch: <T>(path: string, body?: unknown) =>
		request<T>("PATCH", path, { body }),
	put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
	delete: <T>(path: string) => request<T>("DELETE", path),
	/** Para endpoints que responden sin cuerpo (`void` en la API). */
	deleteVoid: (path: string) => request<void>("DELETE", path),
};
