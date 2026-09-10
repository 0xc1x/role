/**
 * Cliente HTTP mínimo para consumir la API BFF (NestJS) desde la landing.
 * Se ejecuta en server (loaders) y en cliente (TanStack Query).
 */
import { env } from "./env";

const API_URL = env.VITE_API_URL ?? "http://localhost:4001/api/v1";

export function apiUrl(): string {
	return API_URL;
}

/** Mensaje legible desde el envelope de error de la API ({message, details}). */
function errorMessage(path: string, status: number, body: string): string {
	const fallback = `API ${path} respondió ${status}`;
	if (!body) return fallback;
	try {
		const parsed = JSON.parse(body) as {
			message?: string | string[];
			details?: { message: string }[];
		};
		const firstDetail = parsed.details?.[0]?.message;
		if (firstDetail) return firstDetail;
		if (typeof parsed.message === "string") return parsed.message;
		if (Array.isArray(parsed.message) && parsed.message[0]) {
			return parsed.message[0];
		}
	} catch {
		return body.slice(0, 300);
	}
	return fallback;
}

export async function apiGet<T>(path: string): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(errorMessage(path, response.status, text));
	}
	return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(errorMessage(path, response.status, text));
	}
	const ct = response.headers.get("content-type") ?? "";
	if (ct.includes("application/json")) return (await response.json()) as T;
	return undefined as T;
}
