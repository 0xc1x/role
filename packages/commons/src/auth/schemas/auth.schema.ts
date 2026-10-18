import { z } from "zod";
import { STAFF_SESSION_REASONS } from "../../business/enums/staff-session-reason";
import { BusinessMemberRoleSchema } from "../../business/schemas/business-member.schema";
import {
	AppRoleSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

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

/**
 * Why the panel may not operate, in the vocabulary the database returns.
 *
 * ─── WHY THIS LIVES UNDER `auth` AND NOT UNDER `business` ────────────────────
 *
 * Because it is what a SESSION is allowed to do, not what a membership is: the
 * panel asks it once after login, before it knows which business it is going to
 * open, and the §9.3 filter is built on the answer. The business half of the
 * contract — role, scope, TTL — is `business-member.schema.ts`; this is the other
 * half, and it crosses over because the whole point is to explain an exit.
 *
 * ─── `role` AND `expires_at` ARE NULLABLE, AND BOTH MEANINGS ARE EXACT ───────
 *
 * `role: null` is not a broken row. It is what `no_membership`,
 * `multiple_businesses` and `disabled` return, and the §9.3 note is explicit that
 * a `null` role is why the filter takes the business as an argument instead of
 * guessing: a person with six businesses is `multiple_businesses`, not `ok`. So
 * the type cannot promise a role — `expires_at: null` means three different
 * things (TTL off, never stamped, no membership), and no union of these six can
 * tell them apart; that is what `reason` is for.
 *
 * ─── THE `reason` LIST IS THE DATABASE'S, AND THIS SCHEMA IS THE COPY ─────────
 *
 * The six values are text literals inside `business_member_session_state()`,
 * not a Postgres enum, so nothing enforces that the two lists match. If the
 * database grows a seventh, THE SCHEMA IS WHAT IS WRONG: add it to
 * `STAFF_SESSION_REASONS`. Narrowing the enum here instead would leave the panel
 * rendering "you were paused" at whoever the new reason was describing, because
 * an unknown value is dropped rather than reported.
 */
export const StaffSessionStateSchema = z.object({
	role: BusinessMemberRoleSchema.nullable(),
	location_ids: z.array(UuidSchema),
	expires_at: TimestamptzSchema.nullable(),
	reason: z.enum(STAFF_SESSION_REASONS),
	business_ids: z.array(UuidSchema),
});

/**
 * `POST /staff/session` — which membership to stamp, IF THE CALLER KNOWS.
 *
 * ─── WHY THE BUSINESS IS IN THE BODY AND NOT IN THE PATH ──────────────────────
 *
 * The other eight §8 routes hang off `businesses/:businessId/staff`; this one
 * does not, because it is the one route any member may call and a path segment
 * read as "the business being administered" would be a claim nobody needs to
 * make. It still has to arrive somewhere, and the honest place is the body:
 * the caller is stamping ONE membership and naming it is not a privilege, it is
 * the statement of which row `last_authenticated_at` belongs to.
 *
 * ─── WHY IT IS OPTIONAL, Y POR QUÉ EL VACÍO NO ES «UN NEGOCIO CUALQUIERA» ──────
 *
 * Because the §5.2 caller does not always know: the panel seals once, right
 * after login, and a panel that just authenticated is exactly the panel that
 * has not chosen a business yet. Making the argument required made the client
 * carry knowledge the route could have resolved for it.
 *
 * Leaving it out asks `business_member_session_state()` with NO argument, and
 * the DATABASE decides: the membership of the caller when it has exactly one
 * active, `multiple_businesses` plus the list when it has several, and
 * `no_membership` / `disabled` when it has none. The route never picks a
 * membership on the caller's behalf —sealing the wrong one renews the session of
 * a business the person is not working in, which is worse than not sealing— so
 * the ambiguous case answers `multiple_businesses` and seals nothing.
 *
 * ─── POR QUÉ NO ES `null` NI UNA CADENA VACÍA ─────────────────────────────────
 *
 * `optional()` y nada más: `business_id: null` es un 400, no un «no sé». Aceptar
 * el `null` haría que un cliente que arma el cuerpo con un valor por defecto
 * pidiera pedir explícitamente la resolución automática y no sabría que la
 * pidió —dos caminos hacia el mismo comportamiento, y el que no se usa es el que
 * nadie prueba.
 *
 * ─── Y EL `.optional()` DE AFUERA, POR EL MISMO MOTIVO QUE EN EL ROTATE ───────
 *
 * Un `POST` sin cuerpo deja `req.body` como `undefined` —medido en el stack real
 * de Nest/Express, no supuesto—, y `strictObject` falla ahí con «expected object,
 * received undefined». La llamada más natural de esta ruta es exactamente la que
 * no manda cuerpo: un `fetch('/staff/session', { method: 'POST' })` después del
 * login. Sin este `.optional()` sería un 400, y la ruta que existe para resolver
 * el negocio por su cuenta no resolvería nada.
 *
 * `.strict()` for the same reason `CreateBusinessMemberSchema` has it: a
 * `member_id` or an `expires_at` in here is a field the route cannot honor, and
 * a 400 that says so beats a 200 that pretended.
 */
export const StampStaffSessionSchema = z
	.object({
		business_id: UuidSchema.optional(),
	})
	.strict()
	.optional();
