import type { AuthUser } from "@0xc1x/role-commons";
import { AuthResponseSchema } from "@0xc1x/role-commons";
import { createServerFn } from "@tanstack/react-start";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { env } from "@/config/env";

/**
 * El refresh token vive SOLO en una cookie httpOnly gestionada por el server
 * de TanStack Start: el cliente nunca lo ve (mitiga robo por XSS). El access
 * token, de vida corta, sigue en localStorage del navegador.
 */
const REFRESH_COOKIE = "role_admin_refresh";

const COOKIE_OPTIONS = {
	path: "/",
	httpOnly: true,
	sameSite: "lax" as const,
	secure: process.env.NODE_ENV === "production",
	// 7 días: alineado con el TTL de refresh token de Supabase Auth.
	maxAge: 60 * 60 * 24 * 7,
};

/** Sesión que el cliente puede ver: nunca incluye el refresh token. */
export interface AdminClientSession {
	access_token: string;
	expires_at: string | null;
	user: AuthUser;
}

const ApiSessionSchema = AuthResponseSchema;

async function apiPost(
	path: string,
	body: unknown,
): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
	const res = await fetch(`${env.VITE_API_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(body),
	});
	const json = (await res.json().catch(() => null)) as
		| (Record<string, unknown> & { message?: unknown })
		| null;
	if (!res.ok) {
		const message =
			typeof json?.message === "string"
				? json.message
				: `API ${path} respondió ${res.status}`;
		return { ok: false, message };
	}
	return { ok: true, json };
}

function persistRefreshCookie(session: { refresh_token: string }) {
	setCookie(REFRESH_COOKIE, session.refresh_token, COOKIE_OPTIONS);
}

function parseApiSession(json: unknown) {
	const parsed = ApiSessionSchema.safeParse(json);
	if (!parsed.success) throw new Error("Respuesta de autenticación inválida");
	return parsed.data;
}

export const loginFn = createServerFn({ method: "POST" })
	.validator((d: { email: string; password: string }) => d)
	.handler(async ({ data }): Promise<AdminClientSession> => {
		const res = await apiPost("/auth/login", data);
		if (!res.ok) throw new Error(res.message);
		const session = parseApiSession(res.json);
		persistRefreshCookie(session);
		return {
			access_token: session.access_token,
			expires_at: session.expires_at,
			user: session.user,
		};
	});

/** Rota el refresh cookie y devuelve un access token nuevo, o null si expiró. */
export const refreshFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{
		access_token: string;
		expires_at: string | null;
	} | null> => {
		const refreshToken = getCookie(REFRESH_COOKIE);
		if (!refreshToken) return null;

		const res = await apiPost("/auth/refresh", { refresh_token: refreshToken });
		if (!res.ok) {
			deleteCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
			return null;
		}
		const session = parseApiSession(res.json);
		persistRefreshCookie(session);
		return {
			access_token: session.access_token,
			expires_at: session.expires_at,
		};
	},
);

/** Revoca el refresh token en la API y borra la cookie. */
export const logoutFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<void> => {
		const refreshToken = getCookie(REFRESH_COOKIE);
		if (refreshToken) {
			// Un refresh ya revocado/expirado no es un error de logout.
			await apiPost("/auth/logout", { refresh_token: refreshToken }).catch(
				() => null,
			);
		}
		deleteCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
	},
);
