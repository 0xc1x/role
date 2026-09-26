import { describe, expect, mock, test } from "bun:test";

// `mapAuthError` lee `strings` y `@/src/core/supabase/client` al importar el
// repositorio, así que el cliente se sustituye ANTES del import dinámico.
mock.module("@/src/core/supabase/client", () => ({ supabase: {} }));

const { mapAuthError } = await import("./repository");
const { strings } = await import("@/src/core/i18n/strings");

/**
 * Every user-facing auth message must be a catalogue value: the catalogue is
 * es-ES by contract, so membership in it IS the "this is Spanish" check.
 */
const CATALOGUE_COPY = new Set<string>(
	Object.values(strings.auth).filter((value) => typeof value === "string"),
);

/**
 * M21: el mensaje crudo de Supabase Auth es inglés y nunca debe llegar a la
 * pantalla. Estas son las clases que login y signup realmente ven.
 */
const CLASSES: Array<[name: string, driverMessage: string]> = [
	["invalid credentials", "Invalid login credentials"],
	["unconfirmed email", "Email not confirmed"],
	["already registered", "User already registered"],
	["expired session", "Your session has expired, please sign in again"],
	["lost refresh token", "Invalid Refresh Token: Refresh Token Not Found"],
	["email rate limit", "Email rate limit exceeded"],
	["request rate limit", "Too many requests. Please wait before trying again."],
	["sms provider failure", "Sms sending failed"],
	["weak password", "Password is too weak"],
	["password too short", "Password should be at least 8 characters"],
	["reused password", "New password should be different from the old password"],
	["malformed email", "Unable to validate email address: invalid format"],
	["totp enrolment failure", "Error enabling MFA TOTP: secret not provided"],
];

describe("mapAuthError", () => {
	for (const [name, driverMessage] of CLASSES) {
		test(`${name} produces catalogue copy, never the driver message`, () => {
			const mapped = mapAuthError({ message: driverMessage });

			expect(mapped.kind).not.toBe("unknown");
			expect(CATALOGUE_COPY.has(mapped.message)).toBe(true);
			expect(mapped.message).not.toContain(driverMessage);
			// Precedence: the raw message is diagnostics only.
			expect(mapped.context?.driverMessage).toBe(driverMessage);
		});
	}

	test("the rate limit, weak password and email format classes are distinct", () => {
		expect(mapAuthError({ message: "Email rate limit exceeded" }).message).toBe(
			strings.auth.errorRateLimited,
		);
		expect(mapAuthError({ message: "Password is too weak" }).message).toBe(
			strings.auth.errorPasswordTooWeak,
		);
		expect(
			mapAuthError({ message: "Unable to validate email address: bad format" })
				.message,
		).toBe(strings.auth.errorEmailFormatRejected);
		expect(mapAuthError({ message: "Sms sending failed" }).message).toBe(
			strings.auth.errorSmsUnavailable,
		);
	});

	test("an unmapped failure never leaks the driver message", () => {
		const driverMessage =
			"AuthApiError: something nobody has ever seen before (code 0)";

		const mapped = mapAuthError({ message: driverMessage });

		expect(mapped.kind).toBe("unknown");
		expect(mapped.message).toBe(strings.auth.errorUnexpected);
		expect(CATALOGUE_COPY.has(mapped.message)).toBe(true);
		expect(mapped.message).not.toContain("AuthApiError");
		expect(mapped.message).not.toContain("code 0");
		// It is still available to logs/Sentry.
		expect(mapped.context?.driverMessage).toBe(driverMessage);
	});

	test("matching is case insensitive, as GoTrue messages are not stable", () => {
		expect(mapAuthError({ message: "INVALID LOGIN CREDENTIALS" }).message).toBe(
			strings.auth.invalidCredentials,
		);
		expect(mapAuthError({ message: "EMAIL RATE LIMIT EXCEEDED" }).message).toBe(
			strings.auth.errorRateLimited,
		);
	});
});
