import { describe, expect, test } from "bun:test";
import { z } from "zod";

const categoriesSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
	search: z.string().optional(),
	active: z
		.union([z.boolean(), z.enum(["true", "false"])])
		.optional()
		.transform((v) => {
			if (v === undefined) return undefined;
			if (typeof v === "boolean") return v;
			return v === "true";
		}),
});

describe("categoriesSearchSchema", () => {
	test("defaults page and limit", () => {
		const result = categoriesSearchSchema.parse({});
		expect(result.page).toBe(1);
		expect(result.limit).toBe(20);
		expect(result.search).toBeUndefined();
		expect(result.active).toBeUndefined();
	});

	test("parses string numbers for page and limit", () => {
		const result = categoriesSearchSchema.parse({
			page: "2",
			limit: "50",
		});
		expect(result.page).toBe(2);
		expect(result.limit).toBe(50);
	});

	test("parses search string", () => {
		const result = categoriesSearchSchema.parse({ search: "foo" });
		expect(result.search).toBe("foo");
	});

	test("transform active boolean true", () => {
		const result = categoriesSearchSchema.parse({ active: true });
		expect(result.active).toBe(true);
	});

	test("transform active boolean false", () => {
		const result = categoriesSearchSchema.parse({ active: false });
		expect(result.active).toBe(false);
	});

	test("transform active string true", () => {
		const result = categoriesSearchSchema.parse({ active: "true" });
		expect(result.active).toBe(true);
	});

	test("transform active string false", () => {
		const result = categoriesSearchSchema.parse({ active: "false" });
		expect(result.active).toBe(false);
	});

	test("active is undefined when not provided", () => {
		const result = categoriesSearchSchema.parse({});
		expect(result.active).toBeUndefined();
	});

	test("rejects limit over 100", () => {
		expect(() => categoriesSearchSchema.parse({ limit: "200" })).toThrow();
	});

	test("rejects negative page", () => {
		expect(() => categoriesSearchSchema.parse({ page: "0" })).toThrow();
	});
});
