import { env } from "@/config/env";
import { ApiClientError, throwFromResponse } from "./errors";

const KEYS = {
	token: "role_admin_auth_token",
	refresh: "role_admin_refresh_token",
	expiresAt: "role_admin_token_expires_at",
} as const;

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

function setItem(key: string, value: string | null) {
	const s = getStorage();
	if (!s) return;
	try {
		if (value) s.setItem(key, value);
		else s.removeItem(key);
	} catch {}
}

export const getToken = () => getItem(KEYS.token);
export const setToken = (v: string | null) => setItem(KEYS.token, v);
export const getRefreshToken = () => getItem(KEYS.refresh);
export const setRefreshToken = (v: string | null) => setItem(KEYS.refresh, v);
export const getTokenExpiresAt = () => getItem(KEYS.expiresAt);
export const setTokenExpiresAt = (v: string | null) => setItem(KEYS.expiresAt, v);

export function clearAuth() {
	const s = getStorage();
	if (!s) return;
	try {
		for (const k of Object.values(KEYS)) s.removeItem(k);
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

function buildHeaders(formData?: FormData, token?: string | null): Record<string, string> {
	const h: Record<string, string> = {};
	if (!formData) h["Content-Type"] = "application/json";
	if (token) h.Authorization = `Bearer ${token}`;
	return h;
}

function buildBody(opts?: { body?: unknown; formData?: FormData }): BodyInit | undefined {
	if (opts?.formData) return opts.formData;
	if (opts?.body) return JSON.stringify(opts.body);
	return undefined;
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
		return res.json() as Promise<T>;
	}

	if (isTokenExpired()) {
		const refreshed = await attemptTokenRefresh();
		if (!refreshed) {
			clearAuth();
			if (typeof window !== "undefined") window.location.href = "/login";
			throw new ApiClientError({ status: 401, message: "Session expired" });
		}
	}

	const token = getToken();
	const headers = buildHeaders(options?.formData, token);
	const body = buildBody(options);
	const response = await fetch(`${env.VITE_API_URL}${path}`, { method, headers, body });

	if (response.status !== 401) {
		if (!response.ok) return throwFromResponse(response);
		return response.json() as Promise<T>;
	}

	const refreshed = await attemptTokenRefresh();
	if (refreshed) {
		const newToken = getToken();
		if (newToken) headers.Authorization = `Bearer ${newToken}`;
		const retry = await fetch(`${env.VITE_API_URL}${path}`, { method, headers, body });
		if (retry.ok) return retry.json() as Promise<T>;
		if (!retry.ok) return throwFromResponse(retry);
	}
	clearAuth();
	if (typeof window !== "undefined") window.location.href = "/login";
	throw new ApiClientError({ status: 401, message: "Session expired" });
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
