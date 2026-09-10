import { describe, expect, test } from "bun:test";

import {
	validateEmailField,
	validateLoginForm,
	validatePasswordField,
	validateSignupForm,
} from "@/features/auth/domain/validation";

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
