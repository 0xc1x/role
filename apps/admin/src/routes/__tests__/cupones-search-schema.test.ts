import { describe, expect, test } from "bun:test";
import { z } from "zod";

const booleanSearch = z
	.union([z.boolean(), z.enum(["true", "false"])])
	.optional()
	.transform((v) => {
		if (v === undefined) return undefined;
		if (typeof v === "boolean") return v;
		return v === "true";
	});

const couponsSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
	search: z.string().optional(),
	is_active: booleanSearch,
	// true → solo globales; false → solo de negocio; undefined → todos.
	global: booleanSearch,
});

describe("couponsSearchSchema", () => {
	test("defaults page and limit", () => {
		const result = couponsSearchSchema.parse({});
		expect(result.page).toBe(1);
		expect(result.limit).toBe(20);
		expect(result.search).toBeUndefined();
		expect(result.is_active).toBeUndefined();
		expect(result.global).toBeUndefined();
	});

	test("parses string numbers for page and limit", () => {
		const result = couponsSearchSchema.parse({
			page: "2",
			limit: "50",
		});
		expect(result.page).toBe(2);
		expect(result.limit).toBe(50);
	});

	test("parses search string", () => {
		const result = couponsSearchSchema.parse({ search: "promo" });
		expect(result.search).toBe("promo");
	});

	test("transform is_active string true", () => {
		const result = couponsSearchSchema.parse({ is_active: "true" });
		expect(result.is_active).toBe(true);
	});

	test("transform global tri-state", () => {
		expect(couponsSearchSchema.parse({ global: "true" }).global).toBe(true);
		expect(couponsSearchSchema.parse({ global: "false" }).global).toBe(false);
		expect(couponsSearchSchema.parse({}).global).toBeUndefined();
		expect(couponsSearchSchema.parse({ global: true }).global).toBe(true);
	});

	test("rejects limit over 100", () => {
		expect(() => couponsSearchSchema.parse({ limit: "200" })).toThrow();
	});

	test("rejects negative page", () => {
		expect(() => couponsSearchSchema.parse({ page: "0" })).toThrow();
	});
});
