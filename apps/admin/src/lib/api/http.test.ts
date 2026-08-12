import { describe, expect, test } from "vitest";
import { toSearchParams } from "./http";

describe("toSearchParams", () => {
	test("returns empty string for undefined query", () => {
		expect(toSearchParams()).toBe("");
	});

	test("returns empty string for empty object", () => {
		expect(toSearchParams({})).toBe("");
	});

	test("skips null and undefined values", () => {
		expect(toSearchParams({ a: "x", b: null, c: undefined })).toBe("?a=x");
	});

	test("skips empty string values", () => {
		expect(toSearchParams({ a: "" })).toBe("");
	});

	test("converts boolean values to strings", () => {
		expect(toSearchParams({ active: true })).toBe("?active=true");
		expect(toSearchParams({ active: false })).toBe("?active=false");
	});

	test("converts number values to strings", () => {
		expect(toSearchParams({ page: 1, limit: 20 })).toBe("?page=1&limit=20");
	});

	test("handles mixed params", () => {
		expect(toSearchParams({ search: "foo", page: 1, limit: null })).toBe(
			"?search=foo&page=1",
		);
	});
});
