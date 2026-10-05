import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

// El consentimiento de analytics NO vive en `profiles`: la fila autoritativa es
// `user_consents`. Un `fetchProfile` que devolvía `false` fijo revocaba el
// consentimiento de todo usuario al leer su perfil, y `_layout` lo propaga a
// `analytics.setConsent` — es decir, apagaba la analítica para siempre.

mock.module("@/src/core/config/env", () => ({
	env: { EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL: "" },
	isProd: false,
}));

type Result = { data: unknown; error: unknown };

const results: Record<string, Result> = {};

/** Cada llamada a `.upsert()`, con su fila y sus opciones, para poder auditarlas. */
const upsertCalls: { row: Record<string, unknown>; options: unknown }[] = [];

/**
 * Cadena de PostgREST encadenable: `profiles` filtra con un `eq` y
 * `user_consents` con dos, así que el mock devuelve el mismo objeto en cada
 * llamada en vez de una forma fija.
 */
function builderFor(table: string) {
	const chain: Record<string, unknown> = {};
	chain.select = () => chain;
	chain.eq = () => chain;
	chain.maybeSingle = async () => results[table] ?? { data: null, error: null };
	chain.upsert = (row: Record<string, unknown>, options?: unknown) => {
		upsertCalls.push({ row, options });
		return Promise.resolve({ data: null, error: null });
	};
	return chain;
}

mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: jest.fn((table: string) => builderFor(table)),
	},
}));

const { authRepository, enrichProfile } = await import("./repository");
import type { UserProfile } from "../domain/user";

const PROFILE_ROW = {
	id: "user-1",
	email: "ana@correo.com",
	full_name: "Ana",
	avatar_url: null,
	phone: null,
	city: "Santo Domingo",
	role: "user",
};

function sessionProfile(analyticsConsentGranted: boolean): UserProfile {
	return {
		id: "user-1",
		email: "ana@correo.com",
		fullName: "Ana",
		avatarUrl: null,
		phone: null,
		city: "Santo Domingo",
		role: "user",
		analyticsConsentGranted,
	};
}

describe("fetchProfile y el consentimiento de analytics", () => {
	test("conserva un consentimiento concedido en la DB", async () => {
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: { granted: true }, error: null };

		const profile = await authRepository.fetchProfile("user-1");

		expect(profile?.analyticsConsentGranted).toBe(true);
	});

	test("refleja una revocación persistida", async () => {
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: { granted: false }, error: null };

		const profile = await authRepository.fetchProfile("user-1");

		expect(profile?.analyticsConsentGranted).toBe(false);
	});

	test("una lectura fallida conserva el valor conocido, no lo revoca", async () => {
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: null, error: { message: "sin red" } };

		const profile = await authRepository.fetchProfile("user-1", true);

		expect(profile?.analyticsConsentGranted).toBe(true);
	});

	test("sin fila de consentimiento y sin valor conocido, no hay consentimiento", async () => {
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: null, error: null };

		const profile = await authRepository.fetchProfile("user-1");

		expect(profile?.analyticsConsentGranted).toBe(false);
	});

	test("enrichProfile no deja que la fila sin fila de consentimiento borre el metadata", async () => {
		// Alta con confirmación de correo: no hay sesión, así que `user_consents`
		// aún no existe, pero el usuario sí lo concedió en el signup.
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: null, error: null };

		const enriched = await enrichProfile(sessionProfile(true));

		expect(enriched.analyticsConsentGranted).toBe(true);
	});

	test("sin fila de consentimiento y con un valor conocido, lo conserva", async () => {
		// El caso que `data?.granted === true` rompía: la fila ausente devolvía
		// `false` (no nullish, así que `??` tampoco lo rescataba) y el store
		// acababa con `analytics.setConsent(false)`. Fallaba cerrado, pero
		// degradaba un consentimiento concedido.
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: null, error: null };

		const profile = await authRepository.fetchProfile("user-1", true);

		expect(profile?.analyticsConsentGranted).toBe(true);
	});

	test("una fila explícitamente revocada gana aunque el fallback diga true", async () => {
		// El fallback solo aplica a lo que NO se pudo leer. Con la fila presente
		// y `granted: false`, la respuesta de la base manda.
		results.profiles = { data: PROFILE_ROW, error: null };
		results.user_consents = { data: { granted: false }, error: null };

		const profile = await authRepository.fetchProfile("user-1", true);

		expect(profile?.analyticsConsentGranted).toBe(false);
	});
});

/**
 * El `onConflict` del upsert de `user_consents`, que sin él devuelve 409.
 *
 * La fila de analytics la deja el trigger `create_default_consents` al crear el
 * perfil, así que SIEMPRE existe: un upsert sin target choca con la UNIQUE
 * (user_id, consent_type) en cada llamada. Como el objeto no manda `id` —lo
 * genera el default `gen_random_uuid()`—, sin target explícito PostgREST solo
 * puede arbitrar por la PK y la sentencia degrada a INSERT plano.
 */
describe("setAnalyticsConsent y el arbitraje del conflicto", () => {
	beforeEach(() => {
		upsertCalls.length = 0;
	});

	test("el upsert declara el target de la UNIQUE (user_id, consent_type)", async () => {
		await authRepository.setAnalyticsConsent("user-1", true);

		expect(upsertCalls).toHaveLength(1);
		expect(upsertCalls[0]?.options).toEqual({
			onConflict: "user_id,consent_type",
		});
	});

	test("no manda `id`: es la PK, y el conflicto no es sobre ella", async () => {
		await authRepository.setAnalyticsConsent("user-1", true);

		// Mandarlo convertiría el upsert en un update por PK y crearía una fila
		// nueva por cada toggle en vez de actualizar la existente.
		expect(upsertCalls[0]?.row).not.toHaveProperty("id");
		expect(upsertCalls[0]?.row).toMatchObject({
			user_id: "user-1",
			consent_type: "analytics",
			granted: true,
		});
	});

	test("revocar limpia `granted_at` y escribe `revoked_at`", async () => {
		// El efecto que se pierde sin target: la fila existente no se toca y su
		// `revoked_at` queda sin escribir, así que el toggle "no" no revoca.
		await authRepository.setAnalyticsConsent("user-1", false);

		expect(upsertCalls[0]?.row).toMatchObject({
			granted: false,
			granted_at: null,
		});
		expect(upsertCalls[0]?.row.revoked_at).toBeString();
	});
});
