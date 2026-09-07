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
	setToken,
	setTokenExpiresAt,
} from "./client";

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
