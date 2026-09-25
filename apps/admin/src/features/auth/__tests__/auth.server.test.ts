import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";

const getCookieMock = jest.fn();
const setCookieMock = jest.fn();
const deleteCookieMock = jest.fn();

const passthroughServerFn = () => ({
	validator: () => passthroughServerFn(),
	handler: (handler: unknown) => handler,
});

mock.module("@tanstack/react-start", () => ({
	createServerFn: () => passthroughServerFn(),
}));

mock.module("@tanstack/react-start/server", () => ({
	getCookie: (...args: unknown[]) => getCookieMock(...args),
	setCookie: (...args: unknown[]) => setCookieMock(...args),
	deleteCookie: (...args: unknown[]) => deleteCookieMock(...args),
}));

mock.module("@/config/env", () => ({
	env: { VITE_API_URL: "http://api.test" },
}));

let logoutFn: unknown;

const originalFetch = globalThis.fetch;

function response(status: number, body: unknown, ok = status < 400) {
	return {
		status,
		ok,
		json: () => Promise.resolve(body),
	} as Response;
}

function logout() {
	return (logoutFn as () => Promise<void>)();
}

describe("auth server logout", () => {
	beforeAll(async () => {
		const modulePath = "../server.ts?auth-logout-test";
		const serverModule = (await import(modulePath)) as {
			logoutFn: unknown;
		};
		logoutFn = serverModule.logoutFn;
	});

	beforeEach(() => {
		getCookieMock.mockReset();
		setCookieMock.mockReset();
		deleteCookieMock.mockReset();
	});

	it("revokes the current refresh session and clears the cookie", async () => {
		getCookieMock.mockReturnValue("refresh-token");
		const fetchMock = jest
			.fn()
			.mockResolvedValue(response(200, { message: "Logged out successfully" }));
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		await logout();

		expect(fetchMock).toHaveBeenCalledWith(
			"http://api.test/auth/logout",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ refresh_token: "refresh-token" }),
			}),
		);
		expect(deleteCookieMock).toHaveBeenCalledWith("role_admin_refresh", {
			path: "/",
		});
	});

	it("propagates API failure but still clears the cookie", async () => {
		getCookieMock.mockReturnValue("refresh-token");
		globalThis.fetch = jest
			.fn()
			.mockResolvedValue(response(500, { message: "revocation failed" }, false)) as unknown as typeof globalThis.fetch;

		await expect(logout()).rejects.toThrow("revocation failed");

		expect(deleteCookieMock).toHaveBeenCalledWith("role_admin_refresh", {
			path: "/",
		});
	});

	it("is idempotent when the refresh cookie is already missing", async () => {
		getCookieMock.mockReturnValue(undefined);
		const fetchMock = jest.fn();
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		await logout();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(deleteCookieMock).toHaveBeenCalledWith("role_admin_refresh", {
			path: "/",
		});
	});
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

afterAll(() => {
	mock.restore();
});
