import {
	type AuthUser,
	AuthUserSchema,
	type LoginRequest,
} from "@0xc1x/role-commons";
import { api, clearAuth, setToken, setTokenExpiresAt } from "@/lib/api/client";
import type { AdminClientSession } from "../server";

export type { AdminClientSession };

/**
 * Login vía server function: el refresh token queda en cookie httpOnly y el
 * cliente solo persiste el access token de vida corta.
 */
export async function login(body: LoginRequest): Promise<AdminClientSession> {
	const { loginFn } = await import("@/features/auth/server");
	const session = await loginFn({ data: body });
	setToken(session.access_token);
	setTokenExpiresAt(session.expires_at);
	return session;
}

/**
 * `GET /auth/me`: la identidad con la que el panel saluda al operador.
 *
 * ─── POR QUÉ SE VALIDA CONTRA EL CONTRATO ────────────────────────────────────
 *
 * El panel ya sabe qué hacer con un usuario: el nombre en la barra lateral, el
 * correo debajo, el saludo de la home. Lo que NO sabía era si el servidor le
 * daba los dos: `GET /auth/me` contestaba `{id, email, role}` —sin
 * `full_name`— y el panel caía al `?? user.email`, pintando el CORREO donde
 * debía ir el nombre. Ningún cliente lo notó, porque un tipo no valida nada:
 * la deriva pasaba en silencio.
 *
 * `AuthUserSchema` (el contrato de `commons`) es la forma que el panel
 * VALIDA, y el mismo criterio de `business-staff.api.ts`: una deriva del
 * servidor tiene que romper en voz alta, no deizarse de un `??`.
 */
export async function getMe(): Promise<{ user: AuthUser }> {
	const res = await api.get<{ user?: unknown }>("/auth/me");
	return { user: AuthUserSchema.parse(res.user) };
}

/** Revoca el refresh token en la API (vía server fn) y limpia el cliente. */
export async function logout(
	revokeSession: () => Promise<void> = async () => {
		const { logoutFn } = await import("@/features/auth/server");
		await logoutFn();
	},
) {
	try {
		await revokeSession();
	} finally {
		clearAuth();
	}
}
