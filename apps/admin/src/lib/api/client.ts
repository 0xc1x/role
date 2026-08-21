import { env } from "@/config/env";
import { ApiClientError, throwFromResponse } from "./errors";

const STORAGE_KEY_TOKEN = "role_admin_auth_token";
const STORAGE_KEY_REFRESH = "role_admin_refresh_token";
const STORAGE_KEY_EXPIRES_AT = "role_admin_token_expires_at";

function getStorage(): Storage | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return localStorage;
	} catch {
		return undefined;
	}
}

export function getToken(): string | null {
	const storage = getStorage();
	if (!storage) return null;
	try {
		return storage.getItem(STORAGE_KEY_TOKEN);
	} catch {
		return null;
	}
}

export function setToken(token: string | null) {
	const storage = getStorage();
	if (!storage) return;
	try {
		if (token) {
			storage.setItem(STORAGE_KEY_TOKEN, token);
		} else {
			storage.removeItem(STORAGE_KEY_TOKEN);
		}
	} catch {}
}

export function getRefreshToken(): string | null {
	const storage = getStorage();
	if (!storage) return null;
	try {
		return storage.getItem(STORAGE_KEY_REFRESH);
	} catch {
		return null;
	}
}

export function setRefreshToken(token: string | null) {
	const storage = getStorage();
	if (!storage) return;
	try {
		if (token) {
			storage.setItem(STORAGE_KEY_REFRESH, token);
		} else {
			storage.removeItem(STORAGE_KEY_REFRESH);
		}
	} catch {}
}

export function getTokenExpiresAt(): string | null {
	const storage = getStorage();
	if (!storage) return null;
	try {
		return storage.getItem(STORAGE_KEY_EXPIRES_AT);
	} catch {
		return null;
	}
}

export function setTokenExpiresAt(expiresAt: string | null) {
	const storage = getStorage();
	if (!storage) return;
	try {
		if (expiresAt) {
			storage.setItem(STORAGE_KEY_EXPIRES_AT, expiresAt);
		} else {
			storage.removeItem(STORAGE_KEY_EXPIRES_AT);
		}
	} catch {}
}

export function clearAuth() {
	const storage = getStorage();
	if (!storage) return;
	try {
		storage.removeItem(STORAGE_KEY_TOKEN);
		storage.removeItem(STORAGE_KEY_REFRESH);
		storage.removeItem(STORAGE_KEY_EXPIRES_AT);
	} catch {}
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
	const refreshToken = getRefreshToken();
	if (!refreshToken) return false;

	if (isRefreshing && refreshPromise) {
		return refreshPromise;
	}

	isRefreshing = true;
	refreshPromise = (async () => {
		try {
			const response = await fetch(`${env.VITE_API_URL}/auth/refresh`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: refreshToken }),
			});

			if (!response.ok) {
				clearAuth();
				return false;
			}

			const data = await response.json();
			setToken(data.access_token);
			setRefreshToken(data.refresh_token);
			setTokenExpiresAt(data.expires_at);
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

async function request<T>(
	method: string,
	path: string,
	options?: {
		body?: unknown;
		skipAuth?: boolean;
		formData?: FormData;
	},
): Promise<T> {
	const headers: Record<string, string> = {};

	if (options?.skipAuth) {
		if (!options.formData) {
			headers["Content-Type"] = "application/json";
		}
		const response = await fetch(`${env.VITE_API_URL}${path}`, {
			method,
			headers,
			body:
				options.formData ??
				(options.body ? JSON.stringify(options.body) : undefined),
		});
		if (!response.ok) {
			return throwFromResponse(response);
		}
		return response.json() as Promise<T>;
	}

	if (isTokenExpired()) {
		const refreshed = await attemptTokenRefresh();
		if (!refreshed) {
			clearAuth();
			if (typeof window !== "undefined") {
				window.location.href = "/login";
			}
			throw new ApiClientError({ status: 401, message: "Session expired" });
		}
	}

	const token = getToken();
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	if (!options?.formData) {
		headers["Content-Type"] = "application/json";
	}

	const response = await fetch(`${env.VITE_API_URL}${path}`, {
		method,
		headers,
		body:
			options?.formData ??
			(options?.body ? JSON.stringify(options.body) : undefined),
	});

	if (response.status === 401) {
		const refreshed = await attemptTokenRefresh();
		if (refreshed) {
			const newToken = getToken();
			if (newToken) {
				headers.Authorization = `Bearer ${newToken}`;
			}
			const retryResponse = await fetch(`${env.VITE_API_URL}${path}`, {
				method,
				headers,
				body:
					options?.formData ??
					(options?.body ? JSON.stringify(options.body) : undefined),
			});
			if (retryResponse.ok) {
				return retryResponse.json() as Promise<T>;
			}
		}
		clearAuth();
		if (typeof window !== "undefined") {
			window.location.href = "/login";
		}
		throw new ApiClientError({ status: 401, message: "Session expired" });
	}

	if (!response.ok) {
		return throwFromResponse(response);
	}

	return response.json() as Promise<T>;
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
};
