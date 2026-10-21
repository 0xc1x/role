import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";

import type { StaffSessionState } from "@0xc1x/role-commons";

const BASE_URL = "https://api.role.ec/api/v1";

/**
 * El sello se prueba contra el cliente REAL de la Task 1, no contra un doble de
 * `api.post`: lo que importa es que salga un `POST /staff/session` con el
 * cuerpo que corresponde, y eso sólo se ve en la petición.
 */
const envMock = { EXPO_PUBLIC_API_URL: BASE_URL };
mock.module("@/src/core/config/env", () => ({ env: envMock, isProd: false }));

const getSessionMock = jest.fn(async () => ({
	data: { session: { access_token: "token-abc" } },
	error: null,
}));

mock.module("@/src/core/supabase/client", () => ({
	supabase: { auth: { getSession: getSessionMock } },
}));

// El mock se registra ANTES de cargar el módulo: `mock.module` no se iza sobre
// los imports, y el cliente real (que habla con Supabase) no debe cargarse en
// un test que no abre un socket.
const { stampStaffSession } = await import("./staff-session");

const SESSION_STATE: StaffSessionState = {
	role: "manager",
	location_ids: [],
	expires_at: null,
	reason: "ok",
	business_ids: ["11111111-1111-4111-8111-111111111111"],
};

type FetchCall = { url: string; init: RequestInit | undefined };

let fetchCalls: FetchCall[] = [];
let fetchResponse: Response;

function jsonResponse(status: number, body: unknown): Response {
	return {
		status,
		ok: status >= 200 && status < 300,
		statusText: "",
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body)),
	} as unknown as Response;
}

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
/** El `console.warn` se intercepta: el fallo esperado no puede ensuciar la salida. */
const warnMock = jest.fn();

beforeEach(() => {
	fetchCalls = [];
	fetchResponse = jsonResponse(200, SESSION_STATE);
	envMock.EXPO_PUBLIC_API_URL = BASE_URL;
	getSessionMock.mockClear();
	warnMock.mockClear();
	console.warn = warnMock as unknown as typeof console.warn;
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init });
		return fetchResponse;
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	console.warn = originalWarn;
});

describe("stampStaffSession", () => {
	test("sin negocio sella con un POST sin cuerpo", async () => {
		const state = await stampStaffSession();

		expect(state).toEqual(SESSION_STATE);
		expect(fetchCalls).toHaveLength(1);
		const call = fetchCalls[0];
		expect(call?.url).toBe(`${BASE_URL}/staff/session`);
		expect(call?.init?.method).toBe("POST");
		// Sin cuerpo: la BASE resuelve la membresía del que pregunta.
		expect(call?.init?.body).toBeUndefined();
	});

	test("con negocio sella esa membresía y sólo esa", async () => {
		const state = await stampStaffSession("business-1");

		expect(state).toEqual(SESSION_STATE);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0]?.url).toBe(`${BASE_URL}/staff/session`);
		expect(fetchCalls[0]?.init?.method).toBe("POST");
		expect(fetchCalls[0]?.init?.body).toBe(
			JSON.stringify({ business_id: "business-1" }),
		);
	});

	test("un fallo de red devuelve null y no propaga", async () => {
		globalThis.fetch = (async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;

		const state = await stampStaffSession();

		// El login ya ocurrió: un fallo al sellar no puede deshacerlo.
		expect(state).toBeNull();
		expect(warnMock).toHaveBeenCalled();
		expect(warnMock.mock.calls[0]?.[0]).toBe("staff_session_stamp_failed");
	});

	test("sin EXPO_PUBLIC_API_URL devuelve null sin llamar a la red", async () => {
		envMock.EXPO_PUBLIC_API_URL = "";

		const state = await stampStaffSession();

		expect(state).toBeNull();
		expect(fetchCalls).toHaveLength(0);
	});
});
