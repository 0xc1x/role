import { describe, expect, test } from "bun:test";
import { emailListOptions } from "../emails.queries";

describe("emailListOptions", () => {
	test("components: queryKey segmentado por recurso y query", () => {
		const q = { limit: 100, active: true };
		expect([...emailListOptions.components(q).queryKey]).toEqual([
			"email",
			"components",
			q,
		]);
	});

	test("templates: queryKey propio por recurso", () => {
		const q = { limit: 100 };
		expect([...emailListOptions.templates(q).queryKey]).toEqual([
			"email",
			"templates",
			q,
		]);
	});

	test("segments: queryKey propio por recurso", () => {
		expect([...emailListOptions.segments({ limit: 100 }).queryKey]).toEqual([
			"email",
			"segments",
			{ limit: 100 },
		]);
	});

	test("campaigns: queryKey propio por recurso", () => {
		expect([...emailListOptions.campaigns({ page: 1 }).queryKey]).toEqual([
			"email",
			"campaigns",
			{ page: 1 },
		]);
	});

	test("queryFn presente en cada opción", () => {
		for (const opt of [
			emailListOptions.components(),
			emailListOptions.templates(),
			emailListOptions.segments(),
			emailListOptions.campaigns(),
		]) {
			expect(typeof opt.queryFn).toBe("function");
		}
	});
});
