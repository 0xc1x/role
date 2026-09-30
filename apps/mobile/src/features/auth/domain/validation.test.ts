import { describe, expect, test } from "bun:test";

import { strings } from "@/src/core/i18n/strings";
import {
	validateBusinessSignupForm,
	validateEmailField,
	validateLoginForm,
	validatePasswordField,
	validateSignupForm,
} from "@/src/features/auth/domain/validation";

describe("auth validation", () => {
	test("email vacío e inválido", () => {
		expect(validateEmailField("")).not.toBeNull();
		expect(validateEmailField("sin-arroba")).not.toBeNull();
		expect(validateEmailField("a@b.com")).toBeNull();
	});

	test("password vacío y corto", () => {
		expect(validatePasswordField("")).not.toBeNull();
		expect(validatePasswordField("1234567", 8)).not.toBeNull();
		expect(validatePasswordField("12345678", 8)).toBeNull();
	});

	test("login ok y ko", () => {
		expect(validateLoginForm("a@b.com", "x").ok).toBe(true);
		expect(validateLoginForm("mal", "").ok).toBe(false);
	});

	test("signup exige nombre y 8 caracteres", () => {
		expect(validateSignupForm("", "a@b.com", "12345678").ok).toBe(false);
		expect(validateSignupForm("Ana", "a@b.com", "corta").ok).toBe(false);
		expect(validateSignupForm("Ana", "a@b.com", "12345678").ok).toBe(true);
	});
});

const COMPLETE = {
	fullName: "Ana Torres",
	email: "ana@panaderia.com",
	password: "12345678",
	confirmPassword: "12345678",
	businessName: "Panadería Ana",
};

describe("business signup validation", () => {
	test("un formulario completo pasa", () => {
		expect(validateBusinessSignupForm(COMPLETE).ok).toBe(true);
	});

	test("cada campo vacío señala su propio error", () => {
		const result = validateBusinessSignupForm({
			fullName: "",
			email: "",
			password: "",
			confirmPassword: "",
			businessName: "",
		});

		expect(result.nameError).toBe(strings.auth.requiredName);
		expect(result.emailError).toBe(strings.auth.requiredEmail);
		expect(result.passwordError).toBe(strings.auth.requiredPassword);
		expect(result.confirmPasswordError).toBe(strings.auth.requiredPassword);
		expect(result.businessNameError).toBe(strings.business.requiredName);
		expect(result.ok).toBe(false);
	});

	test("rechaza el formato de correo", () => {
		const result = validateBusinessSignupForm({
			...COMPLETE,
			email: "ana[at]panaderia.com",
		});
		expect(result.emailError).toBe(strings.auth.invalidEmail);
		expect(result.ok).toBe(false);
	});

	test("exige el mínimo de contraseña del signup de cliente", () => {
		const result = validateBusinessSignupForm({
			...COMPLETE,
			password: "1234567",
			confirmPassword: "1234567",
		});
		expect(result.passwordError).toBe(strings.auth.passwordMinError);
		expect(result.ok).toBe(false);
	});

	test("exige que ambas contraseñas coincidan", () => {
		const result = validateBusinessSignupForm({
			...COMPLETE,
			confirmPassword: "87654321",
		});
		expect(result.confirmPasswordError).toBe(strings.auth.passwordsMismatch);
		expect(result.ok).toBe(false);
	});

	test("solo el espacio en blanco cuenta como vacío", () => {
		expect(
			validateBusinessSignupForm({ ...COMPLETE, businessName: "  " }).ok,
		).toBe(false);
	});
});
