import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";

mock.module("@/config/env", () => ({
	env: { VITE_API_URL: "http://localhost:4001/api/v1" },
}));

/**
 * El refresh token vive en cookie httpOnly: el cliente refresca vía server
 * function (features/auth/server). En tests se mockea el módulo server.
 */
const refreshFnMock = jest.fn();

mock.module("@/features/auth/server", () => ({
	refreshFn: (...args: unknown[]) => refreshFnMock(...args),
}));

import {
	api,
	clearAuth,
	getToken,
	getTokenExpiresAt,
	isStoragePersistent,
	setToken,
	setTokenExpiresAt,
} from "./client";
import { setSessionExpiredHandler } from "./session-expiry";

const originalFetch = globalThis.fetch;

function stubFetch(impl: typeof globalThis.fetch) {
	globalThis.fetch = impl;
}

function unstubFetch() {
	globalThis.fetch = originalFetch;
}

function mockFetchOnce(
	response: Partial<Response> & { json: () => Promise<unknown> },
) {
	const fetchMock = jest.fn(() => Promise.resolve(response as Response));
	stubFetch(fetchMock as unknown as typeof globalThis.fetch);
	return fetchMock;
}

function jsonResponse(
	status: number,
	body: unknown,
	ok = status >= 200 && status < 300,
): Response {
	return {
		status,
		ok,
		json: () => Promise.resolve(body),
		headers: new Headers(),
	} as Response;
}

class MemoryStorage implements Storage {
	store = new Map<string, string>();
	get length() {
		return this.store.size;
	}
	clear() {
		this.store.clear();
	}
	getItem(k: string) {
		return this.store.get(k) ?? null;
	}
	key(i: number) {
		return [...this.store.keys()][i] ?? null;
	}
	removeItem(k: string) {
		this.store.delete(k);
	}
	setItem(k: string, v: string) {
		this.store.set(k, v);
	}
}

function ensureStorage() {
	if (typeof window !== "undefined" && !window.localStorage) {
		Object.defineProperty(window, "localStorage", {
			value: new MemoryStorage(),
			writable: true,
		});
	}
	if (
		typeof globalThis !== "undefined" &&
		!(globalThis as unknown as { localStorage: unknown }).localStorage
	) {
		(globalThis as unknown as { localStorage: Storage }).localStorage =
			new MemoryStorage();
	}
}

describe("storage helpers", () => {
	beforeEach(() => {
		ensureStorage();
		window.localStorage.clear();
		(globalThis as unknown as { localStorage: Storage }).localStorage.clear?.();
		unstubFetch();
		refreshFnMock.mockReset();
	});

	it("get/set/clear token", () => {
		expect(getToken()).toBeNull();
		setToken("abc");
		expect(getToken()).toBe("abc");
		setToken(null);
		expect(getToken()).toBeNull();
	});

	it("clearAuth removes all client-side keys (el refresh vive en cookie)", () => {
		setToken("t");
		setTokenExpiresAt(new Date(Date.now() + 100000).toISOString());
		clearAuth();
		expect(getToken()).toBeNull();
		expect(getTokenExpiresAt()).toBeNull();
	});
});

/**
 * Un `localStorage` que lanza (Safari privado, cuota, iOS ITP) dejaba el panel
 * aparentando sesión guardada y la perdía en cada recarga, sin decir nada. El
 * sonda convierte ese fallo silencioso en un aviso al operador.
 */
describe("sonda de almacenamiento", () => {
	const originalStorage = (globalThis as unknown as { localStorage: Storage })
		.localStorage;

	// `Object.assign` y no el spread: los métodos de `Storage` viven en el
	// prototipo, y un `{...new MemoryStorage()}` perdería `getItem`/`removeItem`
	// (el sonda fallaría entonces por un motivo equivocado).
	function stubStorage(overrides: Partial<Storage>) {
		(globalThis as unknown as { localStorage: Storage }).localStorage =
			Object.assign(new MemoryStorage(), overrides);
	}

	afterEach(() => {
		(globalThis as unknown as { localStorage: Storage }).localStorage =
			originalStorage;
		ensureStorage();
	});

	it("confirma persistencia con un storage que escribe", () => {
		expect(isStoragePersistent()).toBe(true);
	});

	it("reporta que no persiste cuando la escritura lanza", () => {
		stubStorage({
			setItem: () => {
				throw new DOMException("QuotaExceededError");
			},
		});

		expect(isStoragePersistent()).toBe(false);
	});

	it("reporta que no persiste cuando la escritura se pierde en silencio", () => {
		// iOS ITP: `setItem` no lanza, pero el dato no sobrevive. Un sonda que
		// solo comprueba que no lance daría "persiste" y el panel perdería la
		// sesión igual: por eso el sonda relee.
		stubStorage({ setItem: () => undefined });

		expect(isStoragePersistent()).toBe(false);
	});

	it("no deja la clave del sonda en el storage", () => {
		stubStorage({});
		const storage = (globalThis as unknown as { localStorage: Storage })
			.localStorage;

		expect(isStoragePersistent()).toBe(true);
		expect(storage.length).toBe(0);
	});

	it("no propaga el fallo: los helpers siguen siendo fail-safe", () => {
		stubStorage({
			setItem: () => {
				throw new DOMException("QuotaExceededError");
			},
			removeItem: () => {
				throw new DOMException("QuotaExceededError");
			},
		});

		expect(() => setToken("t")).not.toThrow();
		expect(() => clearAuth()).not.toThrow();
		expect(getToken()).toBeNull();
	});
});

describe("api request", () => {
	beforeEach(() => {
		ensureStorage();
		window.localStorage.clear();
		(globalThis as unknown as { localStorage: Storage }).localStorage.clear?.();
		unstubFetch();
		refreshFnMock.mockReset();
	});

	afterEach(() => {
		mock.restore();
		unstubFetch();
	});

	it("skipAuth does not send Authorization and sends JSON header", async () => {
		const fetchMock = mockFetchOnce(jsonResponse(200, { ok: true }));
		await api.post("/test", { a: 1 }, { skipAuth: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, opts] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(
			(opts.headers as Record<string, string>).Authorization,
		).toBeUndefined();
		expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
			"application/json",
		);
	});

	it("sends Authorization when token present", async () => {
		setToken("my-token");
		const fetchMock = mockFetchOnce(jsonResponse(200, { data: 1 }));
		await api.get("/categories");
		const [, opts] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect((opts.headers as Record<string, string>).Authorization).toBe(
			"Bearer my-token",
		);
	});

	it("sends FormData without Content-Type", async () => {
		setToken("t");
		const fd = new FormData();
		fd.append("file", new Blob(["hi"]));
		const fetchMock = mockFetchOnce(jsonResponse(200, { url: "http://x" }));
		await api.post("/upload/image", undefined, { formData: fd });
		const [, opts] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(
			(opts.headers as Record<string, string>)["Content-Type"],
		).toBeUndefined();
		expect(opts.body).toBe(fd);
	});

	it("retries once on 401 with refresh success (server fn)", async () => {
		setToken("old");
		// 1) original request -> 401, 2) retry -> 200 (el refresh va por server fn)
		const fetchMock = jest.fn();
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(401, { message: "Unauthorized" }, false),
			)
			.mockResolvedValueOnce(jsonResponse(200, { data: "ok" }));
		stubFetch(fetchMock as unknown as typeof globalThis.fetch);
		refreshFnMock.mockResolvedValue({
			access_token: "new",
			expires_at: new Date(Date.now() + 3600000).toISOString(),
		});

		const res = await api.get<{ data: string }>("/categories");
		expect(res).toEqual({ data: "ok" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(getToken()).toBe("new");
	});

	it("clears auth and throws on 401 when refresh returns null", async () => {
		setToken("old");
		const fetchMock = jest.fn();
		fetchMock.mockResolvedValueOnce(
			jsonResponse(401, { message: "Unauthorized" }, false),
		);
		stubFetch(fetchMock as unknown as typeof globalThis.fetch);
		refreshFnMock.mockResolvedValue(null);

		await expect(api.get("/categories")).rejects.toMatchObject({ status: 401 });
		expect(getToken()).toBeNull();
	});

	it("pre-refresh when token expired (sin fetch del endpoint de refresh)", async () => {
		// expired 10 min ago
		setToken("expired");
		setTokenExpiresAt(new Date(Date.now() - 10 * 60 * 1000).toISOString());
		const fetchMock = jest.fn();
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { data: "after-refresh" }),
		);
		stubFetch(fetchMock as unknown as typeof globalThis.fetch);
		refreshFnMock.mockResolvedValue({
			access_token: "new2",
			expires_at: new Date(Date.now() + 3600000).toISOString(),
		});

		const res = await api.get("/categories");
		expect(res).toEqual({ data: "after-refresh" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/auth/refresh");
	});
});

/**
 * A9: la sesión expirada se avisa al router (que navega a /login con `from`) en
 * vez de recargar la página. El reload duro tiraba la tarea en curso —un motivo
 * de rechazo a medio escribir— y dejaba un login sin explicación.
 */
describe("sesión expirada", () => {
	beforeEach(() => {
		ensureStorage();
		window.localStorage.clear();
		(globalThis as unknown as { localStorage: Storage }).localStorage.clear?.();
		unstubFetch();
		refreshFnMock.mockReset();
	});

	afterEach(() => {
		setSessionExpiredHandler(null);
	});

	it("notifica al router en vez de recargar, y explica la caída en español", async () => {
		const expired: string[] = [];
		setSessionExpiredHandler(({ from }) => expired.push(from));

		setToken("old");
		setTokenExpiresAt(new Date(Date.now() - 10 * 60 * 1000).toISOString());
		refreshFnMock.mockResolvedValue(null);

		await expect(api.get("/categories")).rejects.toMatchObject({
			status: 401,
			message: "Tu sesión expiró. Inicia sesión de nuevo.",
		});

		// El router decide (navega a /login con `from`): el cliente ya no recarga.
		expect(expired).toHaveLength(1);
		expect(expired[0]).toBe("/home");
		expect(getToken()).toBeNull();
	});

	it("el 401 tras un refresh fallido también pasa por el router", async () => {
		const expired: string[] = [];
		setSessionExpiredHandler(({ from }) => expired.push(from));

		setToken("old");
		const fetchMock = jest.fn();
		fetchMock.mockResolvedValueOnce(
			jsonResponse(401, { message: "Unauthorized" }, false),
		);
		stubFetch(fetchMock as unknown as typeof globalThis.fetch);
		refreshFnMock.mockResolvedValue(null);

		await expect(api.get("/categories")).rejects.toMatchObject({ status: 401 });

		expect(expired).toHaveLength(1);
	});
});
