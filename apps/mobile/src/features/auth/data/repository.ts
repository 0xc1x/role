import { supabase } from "@/src/core/supabase/client";
import { env } from "@/src/core/config/env";
import { AppError, Errors, type ErrorKind } from "@/src/core/error/app-error";
import { strings } from "@/src/core/i18n/strings";

import type { UserProfile } from "../domain/user";
import { parseRole } from "../domain/user";

export interface SignUpResult {
	requiresEmailConfirmation: boolean;
	profile: UserProfile | null;
}

/**
 * Auth data operations against Supabase Auth.
 */
/**
 * Merges the session-metadata profile with the `profiles` table row so
 * DB-backed fields (phone, city, current role) survive signup/login.
 *
 * POR QUÉ `analyticsConsentGranted` NO se mezcla desde la fila: la fuente
 * autoritativa es `user_consents`, y un alta con confirmación de correo
 * todavía no la tiene (sin sesión activa nunca corrió `syncAnalyticsConsent`).
 * Tomar la fila como verdad en ese momento borraría un consentimiento que el
 * usuario sí concedió; el metadata gana aquí y `_layout` sincroniza la fila
 * en el siguiente arranque.
 */
export async function enrichProfile(
	profile: UserProfile,
): Promise<UserProfile> {
	try {
		const row = await authRepository.fetchProfile(
			profile.id,
			profile.analyticsConsentGranted,
		);
		if (!row) return profile;
		return {
			...profile,
			fullName: row.fullName ?? profile.fullName,
			avatarUrl: row.avatarUrl ?? profile.avatarUrl,
			phone: row.phone ?? profile.phone,
			city: row.city ?? profile.city,
			email: row.email || profile.email,
			role: row.role,
		};
	} catch {
		return profile;
	}
}

/**
 * Consentimiento analytics leído de `user_consents`, que es la fila
 * autoritativa: `profiles` NO tiene columna de consentimiento (solo existe
 * `auth.users.user_metadata.analytics_consent_granted`), así que un `select`
 * sobre `profiles` no puede devolverlo.
 *
 * `null` = no se pudo leer. Distinguir "no concedido" de "no se pudo leer" es
 * lo que evita que un fallo de red se convierta en una revocación silenciosa.
 */
async function readAnalyticsConsent(userId: string): Promise<boolean | null> {
	const { data, error } = await supabase
		.from("user_consents")
		.select("granted")
		.eq("user_id", userId)
		.eq("consent_type", "analytics")
		.maybeSingle();
	if (error) return null;
	return data?.granted === true;
}

export const authRepository = {
	async signInWithEmail(email: string, password: string): Promise<UserProfile> {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		if (error) throw mapAuthError(error);
		const user = data.user;
		if (!user) throw Errors.unauthorized(strings.auth.noUserOnLogin);
		// Role must come from the DB row, not signup metadata (it can change).
		return enrichProfile(profileFromUser(user));
	},

	async signUpWithEmail(input: {
		fullName: string;
		email: string;
		password: string;
		role: "user" | "business";
		analyticsConsentGranted: boolean;
	}): Promise<SignUpResult & { userId: string }> {
		const { data, error } = await supabase.auth.signUp({
			email: input.email,
			password: input.password,
			options: {
				data: {
					full_name: input.fullName,
					role: input.role,
					analytics_consent_granted: input.analyticsConsentGranted,
				},
			},
		});
		if (error) throw mapAuthError(error);
		const user = data.user;
		if (!user) throw Errors.validation(strings.auth.signupFailed);

		const hasActiveSession = data.session != null;
		if (hasActiveSession && input.analyticsConsentGranted) {
			await syncAnalyticsConsent(user.id);
		}
		if (!hasActiveSession)
			return {
				requiresEmailConfirmation: true,
				profile: null,
				userId: user.id,
			};
		return {
			requiresEmailConfirmation: false,
			profile: profileFromUser(user),
			userId: user.id,
		};
	},

	async signOut(): Promise<void> {
		await supabase.auth.signOut();
	},

	async sendPasswordResetEmail(email: string): Promise<void> {
		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: env.EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL || undefined,
		});
		if (error) throw mapAuthError(error);
	},

	async updatePassword(newPassword: string): Promise<void> {
		const { error } = await supabase.auth.updateUser({ password: newPassword });
		if (error) throw mapAuthError(error);
	},

	async updateEmail(email: string): Promise<void> {
		const { error } = await supabase.auth.updateUser({ email });
		if (error) throw mapAuthError(error);
	},

	async fetchAnalyticsConsent(userId: string): Promise<boolean> {
		return (await readAnalyticsConsent(userId)) === true;
	},

	async setAnalyticsConsent(userId: string, granted: boolean): Promise<void> {
		const now = new Date().toISOString();
		const { error } = await supabase.from("user_consents").upsert({
			user_id: userId,
			consent_type: "analytics",
			granted,
			granted_at: granted ? now : null,
			revoked_at: granted ? null : now,
		});
		if (error) throw error;
	},

	/**
	 * `consentFallback` es el valor que el llamador YA conoce; se aplica solo si
	 * la fila de `user_consents` no se pudo leer. Ante la duda se conserva lo
	 * conocido: un dato viejo se reconcilia en la siguiente relectura, pero
	 * devolver un `false` fijo revocaba el consentimiento de todo usuario que
	 * guardara su perfil — y `_layout` lo propaga a `analytics.setConsent`.
	 */
	async fetchProfile(
		userId: string,
		consentFallback = false,
	): Promise<UserProfile | null> {
		const { data, error } = await supabase
			.from("profiles")
			.select("id, email, full_name, avatar_url, phone, city, role")
			.eq("id", userId)
			.maybeSingle();
		if (error || !data) return null;
		const granted = await readAnalyticsConsent(userId);
		return {
			id: data.id,
			email: data.email ?? "",
			fullName: data.full_name,
			avatarUrl: data.avatar_url,
			phone: data.phone,
			city: data.city,
			role: parseRole(data.role),
			analyticsConsentGranted: granted ?? consentFallback,
		};
	},
};

function profileFromUser(user: {
	id: string;
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}): UserProfile {
	return {
		id: user.id,
		email: user.email ?? "",
		fullName: (user.user_metadata?.full_name as string | null) ?? null,
		avatarUrl: (user.user_metadata?.avatar_url as string | null) ?? null,
		phone: null,
		city: null,
		role: parseRole(user.user_metadata?.role as string | undefined),
		analyticsConsentGranted:
			user.user_metadata?.analytics_consent_granted === true,
	};
}

export async function syncAnalyticsConsent(userId: string): Promise<void> {
	await authRepository.setAnalyticsConsent(userId, true);
}

/**
 * Traduce los errores de Supabase Auth a la taxonomía de la app.
 *
 * Misma precedencia que `toAppError` (core/error/mapper): el copy es-ES del
 * catálogo es SIEMPRE lo que ve el usuario, y el mensaje crudo del driver
 * (inglés, y a veces con nombres de provider) viaja solo en `context` para
 * logs y Sentry. Antes el `default` era `Errors.unknown(error.message)`, así
 * que todo lo no listado —rate limits, contraseñas débiles, formato de
 * correo, errores de SMS— se renderizaba en inglés en login y signup.
 */
export function mapAuthError(error: { message: string }): AppError {
	const message = error.message.toLowerCase();
	// El orden importa: los mensajes de GoTrue se solapan ("Email rate limit
	// exceeded" también contiene "limit"; "Password should be at least 8
	// characters" no, pero "weak password" sí cae en su propia clase).
	if (
		/rate limit|too many requests|security purposes|over_request_rate_limit|over_email_send_rate_limit/.test(
			message,
		)
	) {
		return authError("validation", strings.auth.errorRateLimited, error);
	}
	if (/password.*(too weak|is too weak|is weak)|weak password/.test(message)) {
		return authError("validation", strings.auth.errorPasswordTooWeak, error);
	}
	if (/password should be at least|at least \d+ characters/.test(message)) {
		return authError("validation", strings.auth.passwordMinError, error);
	}
	if (
		/should be different from the previous password|new password should be different/.test(
			message,
		)
	) {
		return authError("validation", strings.auth.errorPasswordReused, error);
	}
	if (/sms/.test(message)) {
		return authError("validation", strings.auth.errorSmsUnavailable, error);
	}
	if (/totp|mfa|authenticator app/.test(message)) {
		return authError("validation", strings.auth.errorTOTPUnavailable, error);
	}
	if (
		/unable to validate email|email_invalid|invalid email|email address .* invalid|email format/.test(
			message,
		)
	) {
		return authError(
			"validation",
			strings.auth.errorEmailFormatRejected,
			error,
		);
	}
	if (/invalid login credentials|invalid credentials/.test(message)) {
		return authError("unauthorized", strings.auth.invalidCredentials, error);
	}
	if (/email not confirmed/.test(message)) {
		return authError("unauthorized", strings.auth.emailUnconfirmed, error);
	}
	if (
		/already registered|already been registered|user already registered/.test(
			message,
		)
	) {
		return authError("conflict", strings.auth.emailAlreadyRegistered, error);
	}
	if (
		/session.*expired|refresh token not found|refresh_token_not_found/.test(
			message,
		)
	) {
		// `refresh token not found` es la otra mitad de la misma realidad: el
		// refresh token guardado ya no existe, así que hay que volver a
		// entrar. Sin esto caía en el genérico y el usuario no sabía qué hacer.
		return authError("unauthorized", strings.auth.sessionExpired, error);
	}
	// Ningún patrón conocido: copy genérico en español, nunca el driver.
	return authError("unknown", strings.auth.errorUnexpected, error);
}

/** AppError con el copy del catálogo y el mensaje crudo solo como diagnóstico. */
function authError(
	kind: ErrorKind,
	message: string,
	driver: { message: string },
): AppError {
	return new AppError(kind, message, "AUTH_ERROR", {
		driverMessage: driver.message,
	});
}
