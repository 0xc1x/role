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
 * El enganche del sello se prueba por el lado de la RED, no por el lado de una
 * función: lo que hay que afirmar es que un login exitoso sale con un
 * `POST /staff/session` y que un login fallido no sale con ninguno.
 */
const envMock = {
	EXPO_PUBLIC_API_URL: BASE_URL,
	EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL: "",
};
mock.module("@/src/core/config/env", () => ({ env: envMock, isProd: false }));

type QueryResult = { data: unknown; error: unknown };

/** La respuesta de cada tabla, para que `profiles` y `user_consents` no se mezclen. */
const results: Record<string, QueryResult> = {};

/** Cadena de PostgREST encadenable: `profiles` filtra con un `eq` y `user_consents` con dos. */
function builderFor(table: string) {
	const chain: Record<string, unknown> = {};
	chain.select = () => chain;
	chain.eq = () => chain;
	chain.maybeSingle = async () => results[table] ?? { data: null, error: null };
	return chain;
}

type SignInResult = {
	data: {
		user: {
			id: string;
			email: string;
			user_metadata: Record<string, unknown>;
		} | null;
	};
	error: { message: string } | null;
};

let signInResult: SignInResult = { data: { user: null }, error: null };

const signInMock = jest.fn(async () => signInResult);

mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		auth: {
			signInWithPassword: signInMock,
			getSession: async () => ({
				data: { session: { access_token: "token-abc" } },
				error: null,
			}),
		},
		from: (table: string) => builderFor(table),
	},
}));

const { authRepository } = await import("./repository");

const PROFILE_ROW = {
	id: "user-1",
	email: "ana@correo.com",
	full_name: "Ana",
	avatar_url: null,
	phone: null,
	city: "Santo Domingo",
	role: "business",
};

type FetchCall = { url: string; init: RequestInit | undefined };

let fetchCalls: FetchCall[] = [];

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
const warnMock = jest.fn();

beforeEach(() => {
	fetchCalls = [];
	results.profiles = { data: PROFILE_ROW, error: null };
	results.user_consents = { data: { granted: true }, error: null };
	signInResult = { data: { user: null }, error: null };
	signInMock.mockClear();
	warnMock.mockClear();
	console.warn = warnMock as unknown as typeof console.warn;
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init });
		return jsonResponse(200, {
			role: "manager",
			location_ids: [],
			expires_at: null,
			reason: "ok",
			business_ids: ["11111111-1111-4111-8111-111111111111"],
		});
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	console.warn = originalWarn;
});

describe("signInWithEmail y el sello de la sesión de staff", () => {
	test("un login exitoso sella la sesión exactamente una vez", async () => {
		signInResult = {
			data: {
				user: {
					id: "user-1",
					email: "ana@correo.com",
					user_metadata: { full_name: "Ana", role: "business" },
				},
			},
			error: null,
		};

		const profile = await authRepository.signInWithEmail(
			"ana@correo.com",
			"secreto123",
		);

		expect(profile.id).toBe("user-1");
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0]?.url).toBe(`${BASE_URL}/staff/session`);
		expect(fetchCalls[0]?.init?.method).toBe("POST");
		// Sin negocio: el panel todavía no eligió.
		expect(fetchCalls[0]?.init?.body).toBeUndefined();
	});

	test("un login fallido no sella nada", async () => {
		signInResult = {
			data: { user: null },
			error: { message: "Invalid login credentials" },
		};

		await expect(
			authRepository.signInWithEmail("ana@correo.com", "mala"),
		).rejects.toMatchObject({ kind: "unauthorized" });

		expect(fetchCalls).toHaveLength(0);
	});
});
