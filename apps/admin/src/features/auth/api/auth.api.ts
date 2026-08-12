import type {
	AuthResponse,
	AuthUser,
	LoginRequest,
	RegisterRequest,
} from "@0xc1x/role-commons";
import {
	api,
	clearAuth,
	setRefreshToken,
	setToken,
	setTokenExpiresAt,
} from "@/lib/api/client";

function persistSession(response: AuthResponse) {
	setToken(response.access_token);
	setRefreshToken(response.refresh_token);
	setTokenExpiresAt(response.expires_at);
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
	const response = await api.post<AuthResponse>("/auth/login", body, {
		skipAuth: true,
	});
	persistSession(response);
	return response;
}

export async function register(body: RegisterRequest): Promise<AuthResponse> {
	const response = await api.post<AuthResponse>("/auth/register", body, {
		skipAuth: true,
	});
	persistSession(response);
	return response;
}

export async function getMe(): Promise<{ user: AuthUser }> {
	return api.get<{ user: AuthUser }>("/auth/me");
}

export function logout() {
	clearAuth();
}
