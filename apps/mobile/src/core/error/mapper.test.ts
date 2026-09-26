import { describe, expect, test } from "bun:test";

import type { ErrorKind } from "./app-error";
import { Errors } from "./app-error";
import { toAppError } from "./mapper";

/** PostgREST driver error as supabase-js hands it over. */
function pgError(code: string, message: string, extra?: object) {
	return {
		code,
		message,
		details: null,
		hint: null,
		...extra,
	} as unknown;
}

// Codes the mapper claims, with the raw driver copy each one produces today.
const MAPPED_CODES: Array<[string, string, ErrorKind]> = [
	[
		"PGRST116",
		"JSON object requested, multiple (or no) rows returned",
		"not_found",
	],
	["PGRST204", "no rows returned", "not_found"],
	["42501", "permission denied for table offers", "forbidden"],
	[
		"PGRST301",
		"permission denied for function active_offers_near",
		"forbidden",
	],
	[
		"23505",
		'duplicate key value violates unique constraint "offers_business_id_title_key"',
		"conflict",
	],
	[
		"23514",
		'new row violates check constraint "offers_discounted_price_check"',
		"validation",
	],
	[
		"23503",
		'insert or update on table "offers" violates foreign key constraint',
		"validation",
	],
	["22P02", 'invalid input syntax for type uuid: "abc"', "validation"],
	["57014", "canceling statement due to statement timeout", "network"],
	["53300", "too many connections for role authenticated", "network"],
];

/** Copy the repository layer passes at the ~30 `toAppError(x, "…")` call sites. */
const CALLER_FALLBACK = "Error al cargar las ofertas";

describe("toAppError precedence", () => {
	test("the es-ES fallback wins over the raw driver message on every mapped code", () => {
		for (const [code, driverMessage, kind] of MAPPED_CODES) {
			const mapped = toAppError(pgError(code, driverMessage), CALLER_FALLBACK);
			expect(mapped.kind).toBe(kind);
			expect(mapped.message).toBe(CALLER_FALLBACK);
		}
	});

	test("no raw Postgres message, table name or constraint name reaches the user", () => {
		const forbidden =
			/permission denied|table |offers_|constraint|duplicate key|invalid input syntax|rows returned|too many connections|statement timeout/i;
		for (const [code, driverMessage] of MAPPED_CODES) {
			// With a caller fallback…
			expect(
				toAppError(pgError(code, driverMessage), CALLER_FALLBACK).message,
			).not.toMatch(forbidden);
			// …and with the taxonomy default (no fallback at all).
			expect(toAppError(pgError(code, driverMessage)).message).not.toMatch(
				forbidden,
			);
			// The driver text survives in several words, so an app can still read
			// it in an empty state: "you have no business" is not the fix.
			expect(
				toAppError(pgError(code, driverMessage)).message.length,
			).toBeGreaterThan(0);
		}
	});

	test("an unmapped code still produces sensible Spanish copy", () => {
		const withFallback = toAppError(
			pgError("XX000", 'internal error: relation "offers" does not exist'),
			"Error al cargar el catálogo",
		);
		expect(withFallback.message).toBe("Error al cargar el catálogo");
		expect(withFallback.code).toBe("XX000");

		// No fallback: the taxonomy default, never the raw driver message.
		const withoutFallback = toAppError(
			pgError("XX000", 'internal error: relation "offers" does not exist'),
		);
		expect(withoutFallback.message).toBe("Error de base de datos");
		expect(withoutFallback.message).not.toMatch(/offers|relation/i);
	});

	test("a blank fallback falls back to the taxonomy default", () => {
		expect(
			toAppError(pgError("42501", "permission denied for table offers"), "  ")
				.message,
		).toBe(Errors.forbidden().message);
		expect(
			toAppError(pgError("42501", "permission denied for table offers"), "")
				.message,
		).toBe(Errors.forbidden().message);
	});

	test("the raw driver message is preserved for logs, not for the UI", () => {
		const mapped = toAppError(
			pgError("42501", "permission denied for table offers", {
				details: "Failing row contains (id, business_id)",
				hint: "RLS policy offers_select_public",
			}),
			CALLER_FALLBACK,
		);
		expect(mapped.context?.driverMessage).toBe(
			"permission denied for table offers",
		);
		expect(mapped.context?.details).toBe(
			"Failing row contains (id, business_id)",
		);
		expect(mapped.context?.hint).toBe("RLS policy offers_select_public");
		// Only the serialized diagnostics carry the raw text; the message the
		// UI renders does not.
		expect(JSON.stringify(mapped.toJSON().context)).toContain(
			"permission denied",
		);
		expect(mapped.message).not.toMatch(/permission denied/i);
	});

	test("network-like failures keep the connection copy", () => {
		const mapped = toAppError(new TypeError("fetch failed"), CALLER_FALLBACK);
		expect(mapped.kind).toBe("network");
		expect(mapped.message).toBe(Errors.network().message);
		expect(mapped.message).toMatch(/conexión/i);
	});

	test("a non-PostgREST unknown keeps the caller copy", () => {
		expect(toAppError(new Error("boom"), CALLER_FALLBACK).message).toBe(
			CALLER_FALLBACK,
		);
		expect(toAppError(new Error("boom")).message).toBe(
			Errors.unknown().message,
		);
	});

	test("an AppError passes through untouched", () => {
		const original = Errors.unauthorized();
		expect(toAppError(original, CALLER_FALLBACK)).toBe(original);
	});
});

describe("guest auth copy", () => {
	test("unauthorized reads as a sign-in prompt, not a generic failure", () => {
		const guest = Errors.unauthorized();
		expect(guest.kind).toBe("unauthorized");
		expect(guest.message).toMatch(/iniciar sesión/i);
		expect(guest.message).not.toBe(Errors.unknown().message);
	});
});
