import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
	env: { VITE_API_URL: "http://localhost:4001/api/v1" },
}));

import {
	api,
	clearAuth,
	getRefreshToken,
	getToken,
	getTokenExpiresAt,
	setRefreshToken,
	setToken,
	setTokenExpiresAt,
} from "./client";

function mockFetchOnce(
	response: Partial<Response> & { json: () => Promise<unknown> },
) {
	const fetchMock = vi.fn().mockResolvedValue(response as Response);
	vi.stubGlobal("fetch", fetchMock);
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
		vi.unstubAllGlobals();
	});

	it("get/set/clear token", () => {
		expect(getToken()).toBeNull();
		setToken("abc");
		expect(getToken()).toBe("abc");
		setToken(null);
		expect(getToken()).toBeNull();
	});

	it("get/set refresh token", () => {
		setRefreshToken("r1");
		expect(getRefreshToken()).toBe("r1");
		clearAuth();
		expect(getRefreshToken()).toBeNull();
	});

	it("clearAuth removes all keys", () => {
		setToken("t");
		setRefreshToken("r");
		setTokenExpiresAt(new Date(Date.now() + 100000).toISOString());
		clearAuth();
		expect(getToken()).toBeNull();
		expect(getRefreshToken()).toBeNull();
		expect(getTokenExpiresAt()).toBeNull();
	});
});

describe("api request", () => {
	beforeEach(() => {
		ensureStorage();
		window.localStorage.clear();
		(globalThis as unknown as { localStorage: Storage }).localStorage.clear?.();
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("skipAuth does not send Authorization and sends JSON header", async () => {
		const fetchMock = mockFetchOnce(jsonResponse(200, { ok: true }));
		await api.post("/test", { a: 1 }, { skipAuth: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(
			(opts.headers as Record<string, string>)["Authorization"],
		).toBeUndefined();
		expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
			"application/json",
		);
	});

	it("sends Authorization when token present", async () => {
		setToken("my-token");
		const fetchMock = mockFetchOnce(jsonResponse(200, { data: 1 }));
		await api.get("/categories");
		const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
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
		const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(
			(opts.headers as Record<string, string>)["Content-Type"],
		).toBeUndefined();
		expect(opts.body).toBe(fd);
	});

	it("retries once on 401 with refresh success", async () => {
		setToken("old");
		setRefreshToken("refresh-123");
		// first call: 401, second call after refresh: success, plus refresh endpoint call
		const fetchMock = vi.fn();
		// 1) original request -> 401
		// 2) refresh request -> 200 with new tokens
		// 3) retry -> 200
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(401, { message: "Unauthorized" }, false),
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					access_token: "new",
					refresh_token: "new-r",
					expires_at: new Date(Date.now() + 3600000).toISOString(),
				}),
			)
			.mockResolvedValueOnce(jsonResponse(200, { data: "ok" }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await api.get<{ data: string }>("/categories");
		expect(res).toEqual({ data: "ok" });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(getToken()).toBe("new");
	});

	it("clears auth and throws on 401 refresh failure", async () => {
		setToken("old");
		setRefreshToken("bad-refresh");
		const fetchMock = vi.fn();
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(401, { message: "Unauthorized" }, false),
			)
			.mockResolvedValueOnce(jsonResponse(401, { message: "bad" }, false));
		vi.stubGlobal("fetch", fetchMock);

		await expect(api.get("/categories")).rejects.toMatchObject({ status: 401 });
		expect(getToken()).toBeNull();
	});

	it("pre-refresh when token expired", async () => {
		// expired 10 min ago
		setToken("expired");
		setRefreshToken("ref");
		setTokenExpiresAt(new Date(Date.now() - 10 * 60 * 1000).toISOString());
		const fetchMock = vi.fn();
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(200, {
					access_token: "new2",
					refresh_token: "new2-r",
					expires_at: new Date(Date.now() + 3600000).toISOString(),
				}),
			)
			.mockResolvedValueOnce(jsonResponse(200, { data: "after-refresh" }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await api.get("/categories");
		expect(res).toEqual({ data: "after-refresh" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toContain("/auth/refresh");
	});
});
