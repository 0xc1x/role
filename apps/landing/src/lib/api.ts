/**
 * Cliente HTTP mínimo para consumir la API BFF (NestJS) desde la landing.
 * Se ejecuta en server (loaders) y en cliente (TanStack Query).
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4001/api/v1";

export function apiUrl(): string {
	return API_URL;
}

export async function apiGet<T>(path: string): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(`API ${path} respondió ${response.status}`);
	}
	return (await response.json()) as T;
}
