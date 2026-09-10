import { describe, expect, test } from "bun:test";
import { mailsSearchSchema } from "@/features/email/mails-search";

describe("mailsSearchSchema", () => {
	test("tab ausente por defecto", () => {
		const result = mailsSearchSchema.parse({});
		expect(result.tab).toBeUndefined();
	});

	test("acepta tabs válidos", () => {
		for (const tab of [
			"enviar",
			"plantillas",
			"componentes",
			"envios",
		] as const) {
			expect(mailsSearchSchema.parse({ tab }).tab).toBe(tab);
		}
	});

	test("rechaza tab inválido", () => {
		expect(() => mailsSearchSchema.parse({ tab: "spam" })).toThrow();
	});

	test("paginación opcional con coerción", () => {
		const result = mailsSearchSchema.parse({ page: "2", limit: "10" });
		expect(result.page).toBe(2);
		expect(result.limit).toBe(10);
	});

	test("filtros heredan enums del contrato", () => {
		const result = mailsSearchSchema.parse({
			status: "pending",
			type: "campaign",
			search: "boletín",
		});
		expect(result.status).toBe("pending");
		expect(result.type).toBe("campaign");
		expect(result.search).toBe("boletín");
	});

	test("rechaza status fuera del contrato", () => {
		expect(() => mailsSearchSchema.parse({ status: "smoke-signal" })).toThrow();
	});

	test("rechaza type fuera del contrato", () => {
		expect(() => mailsSearchSchema.parse({ type: "pigeon" })).toThrow();
	});
});
