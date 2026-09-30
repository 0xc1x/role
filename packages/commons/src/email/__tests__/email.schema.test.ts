import { describe, expect, it } from "bun:test";
import {
	CreateEmailTemplateSchema,
	UpdateEmailSendSchema,
} from "../schemas/email.schema";

describe("CreateEmailTemplateSchema", () => {
	it("accepts template with defaults", () => {
		expect(
			CreateEmailTemplateSchema.safeParse({
				name: "contacto-notificacion",
				subject: "Nuevo contacto",
				body_html: "<p>Hola</p>",
			}).success,
		).toBe(true);
	});

	it("rejects empty name", () => {
		expect(
			CreateEmailTemplateSchema.safeParse({
				name: "",
				subject: "Test",
				body_html: "<p>x</p>",
				variables: [],
			}).success,
		).toBe(false);
	});
});

describe("UpdateEmailSendSchema", () => {
	it("acepta los campos mutables del ciclo de vida", () => {
		expect(
			UpdateEmailSendSchema.safeParse({
				status: "cancelled",
				scheduled_at: "2026-09-26T12:00:00.000Z",
			}).success,
		).toBe(true);
	});

	// `error_message` sale por DTO y se renderiza en el admin, así que dejarlo
	// escribible por el cliente era una puerta trasera a la redacción: el PATCH
	// persistía el texto crudo de Resend. Se rechaza, no se ignora en silencio.
	it("rechaza error_message: es diagnóstico del servidor", () => {
		const result = UpdateEmailSendSchema.safeParse({
			status: "failed",
			error_message: "API key re_123 rejected for ana@correo.com",
		});

		expect(result.success).toBe(false);
	});

	it("rechaza error_code por la misma razón", () => {
		expect(
			UpdateEmailSendSchema.safeParse({
				status: "failed",
				error_code: "validation_error",
			}).success,
		).toBe(false);
	});

	it("rechaza cualquier clave desconocida en vez de descartarla", () => {
		// Sin `.strict()` el objeto de zod quita la clave y la API respondería
		// 200: el cliente creería haber guardado algo que nadie escribió.
		expect(
			UpdateEmailSendSchema.safeParse({ status: "sent", id: "x" }).success,
		).toBe(false);
	});
});
