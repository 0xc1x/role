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

/**
 * Error de la API con su status HTTP. Sin el status, la landing solo puede
 * reconocer un caso por el texto del backend ("Email is already registered"),
 * que además es inglés y no puede depender de una cadena. `message` conserva
 * el envelope crudo para los errores que no tienen traducción propia.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly path: string;

	constructor(path: string, status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.path = path;
	}

	/** El servidor respondió 409: el recurso ya existe. */
	get isConflict(): boolean {
		return this.status === 409;
	}
}

function apiError(path: string, response: Response, text: string): ApiError {
	return new ApiError(
		path,
		response.status,
		errorMessage(path, response.status, text),
	);
}

export async function apiGet<T>(path: string): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw apiError(path, response, text);
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
		throw apiError(path, response, text);
	}
	const ct = response.headers.get("content-type") ?? "";
	if (ct.includes("application/json")) return (await response.json()) as T;
	return undefined as T;
}
