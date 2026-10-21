import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";

const BASE_URL = "https://api.role.ec/api/v1";

/**
 * El cliente lee la URL del env y el token de la sesión de Supabase: los dos
 * se mockean para que el test no dependa de `.env.local` ni abra un socket.
 */
const envMock = { EXPO_PUBLIC_API_URL: BASE_URL };
mock.module("@/src/core/config/env", () => ({ env: envMock, isProd: false }));

type SessionResult = {
	data: { session: { access_token: string } | null };
	error: null;
};

const getSessionMock = jest.fn<() => Promise<SessionResult>>(async () => ({
	data: { session: { access_token: "token-abc" } },
	error: null,
}));

mock.module("@/src/core/supabase/client", () => ({
	supabase: { auth: { getSession: getSessionMock } },
}));

// El mock se registra ANTES de cargar el cliente: `mock.module` no se iza
// sobre los imports, y el módulo real de Supabase (nativo) no debe llegar a
// cargarse en un test que no habla con la red.
const { api, apiRequest } = await import("@/src/core/api/client");

type FetchCall = { url: string; init: RequestInit | undefined };

let fetchCalls: FetchCall[] = [];
let fetchResponse: Response;
/** Cuántas veces se leyó el cuerpo de la respuesta (un 204 no debe leerse). */
let bodyReads = 0;

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

beforeEach(() => {
	fetchCalls = [];
	bodyReads = 0;
	fetchResponse = jsonResponse(200, {});
	envMock.EXPO_PUBLIC_API_URL = BASE_URL;
	getSessionMock.mockClear();
	getSessionMock.mockImplementation(async () => ({
		data: { session: { access_token: "token-abc" } },
		error: null,
	}));
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init });
		return fetchResponse;
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("apiRequest", () => {
	test("manda el token de la sesión y el content-type", async () => {
		fetchResponse = jsonResponse(201, { id: "member-1" });

		const created = await apiRequest<{ id: string }>(
			"POST",
			"/businesses/x/staff",
			{ body: { label: "Ana" } },
		);

		expect(created).toEqual({ id: "member-1" });
		expect(fetchCalls).toHaveLength(1);
		const call = fetchCalls[0];
		expect(call?.url).toBe(`${BASE_URL}/businesses/x/staff`);
		expect(call?.init?.method).toBe("POST");
		const headers = call?.init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer token-abc");
		expect(headers["content-type"]).toBe("application/json");
		expect(call?.init?.body).toBe(JSON.stringify({ label: "Ana" }));
	});

	test("un 204 devuelve undefined sin leer el cuerpo", async () => {
		fetchResponse = {
			status: 204,
			ok: true,
			statusText: "",
			json: () => {
				bodyReads += 1;
				return Promise.resolve(undefined);
			},
			text: () => {
				bodyReads += 1;
				return Promise.resolve("");
			},
		} as unknown as Response;

		const result = await apiRequest<void>(
			"DELETE",
			"/businesses/x/staff/member-1",
		);

		expect(result).toBeUndefined();
		expect(bodyReads).toBe(0);
	});

	test("sin sesión lanza unauthorized y no hace el fetch", async () => {
		getSessionMock.mockImplementation(async () => ({
			data: { session: null },
			error: null,
		}));

		await expect(
			apiRequest("GET", "/businesses/x/staff"),
		).rejects.toMatchObject({ kind: "unauthorized" });
		expect(fetchCalls).toHaveLength(0);
	});

	test("sin EXPO_PUBLIC_API_URL lanza unknown con el mensaje de configuración", async () => {
		envMock.EXPO_PUBLIC_API_URL = "";

		await expect(
			apiRequest("GET", "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "unknown",
			message: "Falta EXPO_PUBLIC_API_URL",
		});
		expect(fetchCalls).toHaveLength(0);
	});

	test("un 422 del API llega como regla de negocio con la prosa del servidor", async () => {
		fetchResponse = jsonResponse(422, {
			statusCode: 422,
			message: "Tu plan no admite otro acceso",
			error: "Unprocessable Entity",
			requestId: "req-000042",
		});

		await expect(
			apiRequest("POST", "/businesses/x/staff", { body: {} }),
		).rejects.toMatchObject({
			kind: "business_rule",
			code: "422",
			message: "Tu plan no admite otro acceso",
		});
	});

	test("un 401 del API no muestra su texto técnico", async () => {
		// El guard de auth responde en inglés; la persona ve la copia de la
		// taxonomía y el texto crudo queda para el diagnóstico.
		fetchResponse = jsonResponse(401, {
			statusCode: 401,
			message: "Missing access token",
			error: "Unauthorized",
		});

		await expect(
			apiRequest("GET", "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "unauthorized",
			code: "401",
			message: "Debes iniciar sesión para continuar.",
			context: { serverMessage: "Missing access token" },
		});
	});

	test("un fallo de red es `network`", async () => {
		globalThis.fetch = (async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;

		await expect(
			apiRequest("GET", "/businesses/x/staff"),
		).rejects.toMatchObject({ kind: "network" });
	});

	test("un 2xx con un cuerpo que no es JSON no suelta un SyntaxError crudo", async () => {
		fetchResponse = {
			status: 200,
			ok: true,
			statusText: "",
			text: () => Promise.resolve("<html>hola</html>"),
		} as unknown as Response;

		await expect(
			apiRequest("GET", "/businesses/x/staff"),
		).rejects.toMatchObject({ kind: "unknown" });
	});
});

describe("api", () => {
	test("cada verbo pega en su método", async () => {
		fetchResponse = jsonResponse(200, { ok: true });

		await api.get("/businesses/x/staff");
		await api.post("/businesses/x/staff", { label: "Ana" });
		await api.patch("/businesses/x/staff/member-1", { role: "staff" });
		await api.delete("/businesses/x/staff/member-1");

		expect(fetchCalls.map((call) => call.init?.method)).toEqual([
			"GET",
			"POST",
			"PATCH",
			"DELETE",
		]);
	});
});
