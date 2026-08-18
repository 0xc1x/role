import type { PostgrestError } from "@supabase/supabase-js";

import { AppError, Errors } from "./app-error";

/**
 * Maps Supabase/PostgREST errors and thrown unknowns to the app error
 * taxonomy. Keeps repositories free of raw error bubbling.
 */
export function toAppError(error: unknown, fallback?: string): AppError {
	if (error instanceof AppError) return error;

	if (isPostgrestError(error)) {
		return mapPostgrestError(error, fallback);
	}

	if (isNetworkLike(error)) {
		return Errors.network();
	}

	return Errors.unknown(fallback);
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

function mapPostgrestError(error: PostgrestError, fallback?: string): AppError {
	switch (error.code) {
		case "PGRST116": // result contains 0 rows (single)
		case "PGRST204":
			return Errors.notFound(error.message || fallback);
		case "42501": // permission denied
		case "PGRST301":
			return Errors.forbidden(error.message || fallback);
		case "23505": // unique violation
			return Errors.conflict(error.message || fallback);
		case "23514": // check constraint
		case "23503": // FK violation
			return Errors.validation(error.message || fallback);
		case "22P02": // invalid text representation
			return Errors.validation(error.message || fallback);
		case "57014": // query canceled
		case "53300": // too many connections
			return Errors.network(error.message || fallback);
		default:
			return AppError.of(
				"unknown",
				error.message || fallback || "Error de base de datos",
				error.code,
			);
	}
}

function isNetworkLike(e: unknown): boolean {
	if (e instanceof Error) {
		return /network|fetch failed|connection|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
			e.message,
		);
	}
	return false;
}
