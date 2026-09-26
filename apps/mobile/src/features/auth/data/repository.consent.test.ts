import { describe, expect, jest, mock, test } from "bun:test";

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
});
