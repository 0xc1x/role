import { strings } from "@/core/i18n/strings";

/** Pure form validators (no React, no repos) for auth screens. */

export function validateEmailField(email: string): string | null {
	const trimmed = email.trim();
	if (!trimmed) return strings.auth.requiredEmail;
	if (!trimmed.includes("@")) return strings.auth.invalidEmail;
	return null;
}

export function validatePasswordField(password: string, minLength = 1): string | null {
	if (!password) return strings.auth.requiredPassword;
	if (password.length < minLength) return strings.auth.passwordMinError;
	return null;
}

export function validateLoginForm(email: string, password: string): {
	emailError: string | null;
	passwordError: string | null;
	ok: boolean;
} {
	const emailError = validateEmailField(email);
	const passwordError = validatePasswordField(password);
	return { emailError, passwordError, ok: !emailError && !passwordError };
}

export function validateSignupForm(
	fullName: string,
	email: string,
	password: string,
): {
	nameError: string | null;
	emailError: string | null;
	passwordError: string | null;
	ok: boolean;
} {
	const nameError = fullName.trim() ? null : strings.auth.requiredName;
	const emailError = validateEmailField(email);
	const passwordError = validatePasswordField(password, 8);
	return { nameError, emailError, passwordError, ok: !nameError && !emailError && !passwordError };
}
