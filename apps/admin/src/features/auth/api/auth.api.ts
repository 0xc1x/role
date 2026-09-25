import type { AuthUser, LoginRequest } from "@0xc1x/role-commons";
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

export async function getMe(): Promise<{ user: AuthUser }> {
	return api.get<{ user: AuthUser }>("/auth/me");
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
