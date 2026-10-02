import { describe, expect, it } from "bun:test";
import {
	ContactMessageDetailSchema,
	ContactMessageListItemSchema,
	ContactMessageValueSchema,
	ListContactMessagesQuerySchema,
} from "../schemas/contact-inbox.schema";

/**
 * El `value` del mensaje de contacto es `jsonb` sin tipo. Este schema es lo que
 * separa "una fila rara" de "toda la bandeja caída", así que los casos que
 * importan son los que NO deben romperse y el que sí debe marcar la fila como
 * ilegible.
 */

const valorValido = {
	name: "Ana",
	email: "ana@example.com",
	role: "persona" as const,
	city: "Quito",
	city_raw: "Quito",
	city_other: null,
	message: "Quiero recibir comida en mi casa",
	at: "2026-09-20T10:00:00.000Z",
	ip: "203.0.113.7",
	to: "hola@role.ec",
	from: "notificaciones@role.ec",
};

describe("ContactMessageValueSchema", () => {
	it("parsea el value que escribe el camino público", () => {
		const parsed = ContactMessageValueSchema.parse(valorValido);
		expect(parsed.email).toBe("ana@example.com");
		expect(parsed.ip).toBe("203.0.113.7");
	});

	it("tolera los null y los campos ausentes que escribe contact.service", () => {
		const parsed = ContactMessageValueSchema.parse({
			name: "",
			email: "b@example.com",
			role: "negocio",
			city: "Otra",
			city_raw: "Otra",
			city_other: "Ambato",
			message: null,
			at: "2026-09-20T10:00:00.000Z",
			ip: null,
			to: "negocios@role.ec",
			from: "notificaciones@role.ec",
		});
		expect(parsed.message).toBeNull();
		expect(parsed.ip).toBeNull();
	});

	it("tolera un value con lo mínimo y descarta lo que no conoce", () => {
		const parsed = ContactMessageValueSchema.parse({
			email: "c@example.com",
			role: "negocio",
			city: "Guayaquil",
			error: "Error",
		});
		expect(parsed.email).toBe("c@example.com");
		// `error` lo agrega el camino de fallo de la entrega: no puede hacer
		// ilegible una fila que el operador todavía puede leer.
		expect("error" in parsed).toBe(false);
	});

	it("exige email, role y city: son los que identifican un mensaje de contacto", () => {
		// Sin ellos, un objeto cualquiera bajo el namespace `contact` pasaba el
		// parseo y salía como fila "legible" con todo en null, indistinguible de
		// un mensaje realmente vacío.
		for (const incompleto of [
			{ role: "persona", city: "Quito" },
			{ email: "a@b.cl", city: "Quito" },
			{ email: "a@b.cl", role: "persona" },
			{ basura: true },
		]) {
			expect(ContactMessageValueSchema.safeParse(incompleto).success).toBe(
				false,
			);
		}
	});

	it("acepta un mensaje más largo que el límite de escritura", () => {
		// El `.max(2000)` de CreateContactSchema es regla de escritura, no de
		// forma: una fila vieja que lo exceda no puede perder nombre y correo.
		const largo = "a".repeat(5000);
		expect(
			ContactMessageValueSchema.safeParse({ ...valorValido, message: largo })
				.success,
		).toBe(true);
	});

	it("rechaza un value con un tipo incorrecto", () => {
		expect(
			ContactMessageValueSchema.safeParse({ ...valorValido, email: 42 })
				.success,
		).toBe(false);
		expect(
			ContactMessageValueSchema.safeParse({
				...valorValido,
				role: "otro-rol",
			}).success,
		).toBe(false);
		expect(
			ContactMessageValueSchema.safeParse("no soy un objeto").success,
		).toBe(false);
		expect(ContactMessageValueSchema.safeParse(null).success).toBe(false);
	});
});

describe("los DTO de la bandeja no exponen el routing interno", () => {
	it("el listado no tiene to, from ni ip", () => {
		const claves = Object.keys(ContactMessageListItemSchema.shape).sort();
		expect(claves).toEqual([
			"city",
			"created_at",
			"delivery_status",
			"email",
			"excerpt",
			"id",
			"name",
			"readable",
			"role",
			"updated_at",
		]);
	});

	it("el detalle agrega el cuerpo y la ip, pero nunca to ni from", () => {
		const claves = Object.keys(ContactMessageDetailSchema.shape);
		expect(claves).toContain("message");
		expect(claves).toContain("ip");
		expect(claves).not.toContain("to");
		expect(claves).not.toContain("from");
	});
});

describe("una fila ilegible se representa sin lanzar", () => {
	it("el listado acepta readable:false con todo en null", () => {
		const fila = ContactMessageListItemSchema.parse({
			id: "11111111-1111-4111-8111-111111111111",
			delivery_status: "PENDIENTE",
			created_at: "2026-09-20T10:00:00.000Z",
			updated_at: "2026-09-20T10:00:00.000Z",
			readable: false,
			name: null,
			email: null,
			role: null,
			city: null,
			excerpt: null,
		});
		expect(fila.readable).toBe(false);
		expect(fila.email).toBeNull();
	});
});

describe("ListContactMessagesQuerySchema", () => {
	it("aplica paginación por defecto", () => {
		const parsed = ListContactMessagesQuerySchema.parse({});
		expect(parsed).toEqual({ page: 1, limit: 20 });
	});

	it("acepta los tres estados de entrega", () => {
		for (const delivery_status of [
			"PENDIENTE",
			"PROCESADO",
			"ERROR",
		] as const) {
			expect(
				ListContactMessagesQuerySchema.parse({ delivery_status })
					.delivery_status,
			).toBe(delivery_status);
		}
	});

	it("rechaza un estado de entrega que no existe en el enum", () => {
		expect(
			ListContactMessagesQuerySchema.safeParse({
				delivery_status: "NUEVO",
			}).success,
		).toBe(false);
	});

	it("descarta un namespace del cliente en vez de obedecerlo", () => {
		const parsed = ListContactMessagesQuerySchema.parse({
			namespace: "jobs",
		});
		expect("namespace" in parsed).toBe(false);
	});
});
