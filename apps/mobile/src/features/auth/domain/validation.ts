import { strings } from "@/src/core/i18n/strings";

/** Pure form validators (no React, no repos) for auth screens. */

/** Password floor shared by every signup (consumer and business owner). */
export const PASSWORD_MIN_LENGTH = 8;

export function validateEmailField(email: string): string | null {
	const trimmed = email.trim();
	if (!trimmed) return strings.auth.requiredEmail;
	if (!trimmed.includes("@")) return strings.auth.invalidEmail;
	return null;
}

export function validatePasswordField(
	password: string,
	minLength = 1,
): string | null {
	if (!password) return strings.auth.requiredPassword;
	if (password.length < minLength) return strings.auth.passwordMinError;
	return null;
}

export function validateLoginForm(
	email: string,
	password: string,
): {
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
	const passwordError = validatePasswordField(password, PASSWORD_MIN_LENGTH);
	return {
		nameError,
		emailError,
		passwordError,
		ok: !nameError && !emailError && !passwordError,
	};
}

/**
 * Business-owner signup: the consumer rules (valid email, password floor) plus
 * the confirmation match and the business name. Same shape as
 * `validateSignupForm` so the screen can render one error per field.
 */
export function validateBusinessSignupForm(fields: {
	fullName: string;
	email: string;
	password: string;
	confirmPassword: string;
	businessName: string;
}): {
	nameError: string | null;
	emailError: string | null;
	passwordError: string | null;
	confirmPasswordError: string | null;
	businessNameError: string | null;
	ok: boolean;
} {
	const nameError = fields.fullName.trim() ? null : strings.auth.requiredName;
	const emailError = validateEmailField(fields.email);
	const passwordError = validatePasswordField(
		fields.password,
		PASSWORD_MIN_LENGTH,
	);
	// A mismatch only means something once both fields carry content.
	const confirmPasswordError = !fields.confirmPassword
		? strings.auth.requiredPassword
		: fields.password === fields.confirmPassword
			? null
			: strings.auth.passwordsMismatch;
	const businessNameError = fields.businessName.trim()
		? null
		: strings.business.requiredName;
	return {
		nameError,
		emailError,
		passwordError,
		confirmPasswordError,
		businessNameError,
		ok:
			!nameError &&
			!emailError &&
			!passwordError &&
			!confirmPasswordError &&
			!businessNameError,
	};
}
