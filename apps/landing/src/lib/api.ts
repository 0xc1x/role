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

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		let msg = `API ${path} respondió ${response.status}`;
		try {
			const j = JSON.parse(text) as {
				message?: string;
				details?: { message: string }[];
			};
			if (j.details?.[0]?.message) msg = j.details[0].message;
			else if (typeof j.message === "string") msg = j.message;
		} catch {
			if (text) msg = text.slice(0, 300);
		}
		throw new Error(msg);
	}
	const ct = response.headers.get("content-type") ?? "";
	if (ct.includes("application/json")) return (await response.json()) as T;
	return undefined as T;
}
