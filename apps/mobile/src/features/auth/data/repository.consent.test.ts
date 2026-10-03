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
 * Última escritura que pasó por el mock, para poder afirmar sobre la segunda
 * argumento de `upsert` —que es donde vive el `onConflict`.
 */
let ultimaEscritura: {
	tabla: string;
	payload: Record<string, unknown>;
	options: Record<string, unknown> | undefined;
} | null = null;

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
	chain.upsert = async (
		payload: Record<string, unknown>,
		options?: Record<string, unknown>,
	) => {
		ultimaEscritura = { tabla: table, payload, options };
		return { data: null, error: null };
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

describe("setAnalyticsConsent: el conflicto tiene que ser sobre la UNIQUE, no la PK", () => {
	test("el upsert declara onConflict sobre (user_id, consent_type)", async () => {
		await authRepository.setAnalyticsConsent("user-1", true);

		expect(ultimaEscritura?.tabla).toBe("user_consents");
		expect(ultimaEscritura?.options).toEqual({
			onConflict: "user_id,consent_type",
		});
	});

	test("el payload no manda id, que es lo que hacía fallar el segundo write", async () => {
		await authRepository.setAnalyticsConsent("user-1", false);

		expect(ultimaEscritura?.payload).not.toHaveProperty("id");
		expect(ultimaEscritura?.payload.consent_type).toBe("analytics");
	});

	test("revocar pone revoked_at y concede lo deja en null", async () => {
		await authRepository.setAnalyticsConsent("user-1", true);
		expect(ultimaEscritura?.payload.granted).toBe(true);
		expect(ultimaEscritura?.payload.granted_at).not.toBeNull();
		expect(ultimaEscritura?.payload.revoked_at).toBeNull();

		await authRepository.setAnalyticsConsent("user-1", false);
		expect(ultimaEscritura?.payload.granted).toBe(false);
		expect(ultimaEscritura?.payload.granted_at).toBeNull();
		expect(ultimaEscritura?.payload.revoked_at).not.toBeNull();
	});
});

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
