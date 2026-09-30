import { describe, expect, it } from "bun:test";
import * as contactEnums from "../enums/contact.enum";
import { CreateContactSchema } from "../schemas/contact.schema";

describe("contact enums", () => {
	// La geografía de lanzamiento es dato de plataforma (`app_config`), no de
	// contrato. Un fallback de ciudades en commons era un segundo SSOT que
	// nadie actualizaba al abrir una ciudad.
	it("no publica una lista de ciudades de respaldo", () => {
		expect("CONTACT_CITIES_FALLBACK" in contactEnums).toBe(false);
		expect(contactEnums.CONTACT_ROLES).toEqual(["negocio", "persona"]);
	});
});

describe("CreateContactSchema", () => {
	const base = {
		email: "Test@Example.COM",
		role: "persona" as const,
		city: "Quito",
	};

	it("accepts valid contact and normalizes email", () => {
		const parsed = CreateContactSchema.parse(base);
		expect(parsed.email).toBe("test@example.com");
		expect(parsed.name).toBe("");
	});

	it("rejects invalid email", () => {
		expect(
			CreateContactSchema.safeParse({ ...base, email: "not-email" }).success,
		).toBe(false);
	});

	it("requires city_other when city is Otra", () => {
		const result = CreateContactSchema.safeParse({ ...base, city: "Otra" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(
				result.error.issues.some((i) => i.path.includes("city_other")),
			).toBe(true);
		}
	});

	it("accepts Otra with city_other", () => {
		const parsed = CreateContactSchema.parse({
			...base,
			city: "Otra",
			city_other: "Ambato",
		});
		expect(parsed.city_other).toBe("Ambato");
	});
});
