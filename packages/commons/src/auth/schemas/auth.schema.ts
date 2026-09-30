import { z } from "zod";
import { AppRoleSchema, TimestamptzSchema } from "../../_common/schemas/common";

/**
 * The password policy of the platform, in ONE place.
 *
 * `handle_new_user` enforces nothing (GoTrue's own minimum is 6 characters), and
 * the register path is the de-facto policy: 8 characters. Both `register` and
 * `reset-password` therefore read this constant instead of repeating a literal,
 * so "the recovery flow accepts exactly what registration accepts" is a
 * structural property rather than two numbers that happen to match today.
 *
 * It is deliberately ONLY a length. A recovery endpoint that silently tightened
 * the policy would reject a password the same person was allowed to choose at
 * signup, and the reset is the one flow where the user cannot be asked to
 * improvise something they already use everywhere else.
 */
export const PasswordSchema = z.string().min(8);

export const LoginRequestSchema = z.object({
	email: z.email(),
	password: z.string().min(6),
});

export const RegisterRequestSchema = z.object({
	email: z.email(),
	password: PasswordSchema,
	full_name: z.string().min(2).max(100),
});

export const RefreshRequestSchema = z.object({
	refresh_token: z.string().min(1),
});

export const LogoutRequestSchema = z.object({
	refresh_token: z.string().min(1),
});

/**
 * `POST /auth/forgot-password` — the body is ONLY an address, and the response
 * is the same 200 whether or not an account holds it.
 *
 * Nothing else is accepted, in particular not a captcha token and not a
 * "redirect me after recovery" URL: a caller-supplied redirect on an
 * unauthenticated endpoint is a phishing primitive (an attacker picks the host
 * the recovery link lands on and the address is harvested by the redirect
 * itself). The redirect is fixed server-side from `AUTH_REDIRECT_TO`.
 */
export const ForgotPasswordRequestSchema = z.object({
	email: z.email(),
});

/**
 * `POST /auth/reset-password`.
 *
 * `access_token` is the bearer credential the client took from the recovery
 * link's redirect. The API verifies it with the same `jose` verification the
 * `AuthGuard` uses for a session token — the client sending it is NOT evidence
 * that it is valid, which is the whole reason this is not a
 * `supabase.auth.verifyOtp` call.
 *
 * `password` reuses {@link PasswordSchema}: see its note for why the recovery
 * flow must not apply a different rule than `register`.
 */
export const ResetPasswordRequestSchema = z.object({
	access_token: z.string().min(1),
	password: PasswordSchema,
});

/**
 * `POST /auth/change-email` — the authenticated counterpart of a GoTrue email
 * change.
 *
 * `new_email` is the address REQUESTED, not the address in force: GoTrue does
 * not apply the change until the new address is confirmed, and this API cannot
 * observe that confirmation, so the response reports a `pending_email` and a
 * 202 rather than pretending the profile moved. `profiles.email` is synced by
 * the `auth.users` AFTER UPDATE OF email trigger when the change lands.
 */
export const ChangeEmailRequestSchema = z.object({
	new_email: z.email(),
});

/**
 * The body of a successful `forgot-password`, byte-identical for a known and an
 * unknown address. Declared as a schema (not a bare string in the controller)
 * so the "one response for both branches" invariant is a checked contract
 * rather than a comment.
 */
export const ForgotPasswordResponseSchema = z.object({
	message: z.string().min(1),
});

/** `POST /auth/reset-password` success body. Says nothing the caller must not learn. */
export const ResetPasswordResponseSchema = z.object({
	message: z.string().min(1),
});

/**
 * `POST /auth/change-email` success body.
 *
 * `pending_email` is the address the change was initiated for, echoed back so
 * the client can tell the user which inbox to watch. It is NOT a claim that the
 * account uses it yet — that is what the 202 means.
 */
export const ChangeEmailResponseSchema = z.object({
	message: z.string().min(1),
	pending_email: z.email(),
});

/** Admin-only: invite a business operator account. */
export const InviteBusinessRequestSchema = z.object({
	email: z.email(),
	full_name: z.string().min(2).max(100),
	/** Optional temporary password; if omitted, Supabase invite email is used when possible. */
	password: z.string().min(8).optional(),
});

/**
 * Usuario autenticado expuesto por la API (`/auth/me`, sesión de admin).
 * Espejo del perfil sin `city` ni timestamps de auditoría.
 */
export const AuthUserSchema = z.object({
	id: z.uuid(),
	email: z.email(),
	full_name: z.string().nullable(),
	avatar_url: z.string().nullable(),
	role: AppRoleSchema,
});

/** Respuesta de login/refresh de la API: tokens de sesión + usuario autenticado. */
export const AuthResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	expires_at: TimestamptzSchema.nullable(),
	user: AuthUserSchema,
});
