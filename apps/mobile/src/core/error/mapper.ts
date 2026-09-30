import type { PostgrestError } from "@supabase/supabase-js";

import { AppError, Errors } from "./app-error";

/**
 * Maps Supabase/PostgREST errors and thrown unknowns to the app error
 * taxonomy. Keeps repositories free of raw error bubbling.
 *
 * Precedence: the es-ES `fallback` passed by the call site is ALWAYS the
 * user-facing copy. The raw driver message is diagnostic only — it is English
 * and it leaks table and constraint names (`permission denied for table
 * offers`, `offers_business_id_title_key`) — so it travels in `context` for
 * logs and Sentry and never reaches the UI.
 */
export function toAppError(error: unknown, fallback?: string): AppError {
	if (error instanceof AppError) return error;

	// A blank fallback is no copy at all: keep the taxonomy default instead of
	// surfacing an empty message.
	const copy = fallback?.trim() ? fallback : undefined;

	if (isPostgrestError(error)) {
		return mapPostgrestError(error, copy);
	}

	if (isNetworkLike(error)) {
		return Errors.network();
	}

	return Errors.unknown(copy);
}

function isPostgrestError(e: unknown): e is PostgrestError {
	return (
		typeof e === "object" &&
		e !== null &&
		"code" in e &&
		typeof (e as { code?: unknown }).code === "string" &&
		"message" in e
	);
}

function mapPostgrestError(error: PostgrestError, copy?: string): AppError {
	const diagnostics = {
		driverMessage: error.message,
		details: error.details,
		hint: error.hint,
	};
	switch (error.code) {
		case "PGRST116": // result contains 0 rows (single)
		case "PGRST204":
			return withDiagnostics(Errors.notFound(copy), diagnostics);
		case "42501": // permission denied
		case "PGRST301":
			return withDiagnostics(Errors.forbidden(copy), diagnostics);
		case "23505": // unique violation
			return withDiagnostics(Errors.conflict(copy), diagnostics);
		case "23514": // check constraint
		case "23503": // FK violation
			return withDiagnostics(Errors.validation(copy), diagnostics);
		case "22P02": // invalid text representation
			return withDiagnostics(Errors.validation(copy), diagnostics);
		case "57014": // query canceled
		case "53300": // too many connections
			return withDiagnostics(Errors.network(copy), diagnostics);
		default:
			return withDiagnostics(
				AppError.of("unknown", copy ?? "Error de base de datos", error.code),
				diagnostics,
			);
	}
}

/** Keeps the user-facing copy and re-attaches the raw driver message for observability. */
function withDiagnostics(
	error: AppError,
	diagnostics: Record<string, unknown>,
): AppError {
	return new AppError(error.kind, error.message, error.code, {
		...diagnostics,
		...error.context,
	});
}

function isNetworkLike(e: unknown): boolean {
	if (e instanceof Error) {
		return /network|fetch failed|connection|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
			e.message,
		);
	}
	return false;
}
