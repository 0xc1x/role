import { describe, expect, test } from "vitest";
import { categoriesKeys } from "../categories.keys";

describe("categoriesKeys", () => {
	test("all returns base key", () => {
		expect(categoriesKeys.all).toEqual(["categories"]);
	});

	test("lists returns list subset", () => {
		expect(categoriesKeys.lists()).toEqual(["categories", "list"]);
	});

	test("list with undefined params", () => {
		expect(categoriesKeys.list()).toEqual(["categories", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, search: "test", active: true };
		expect(categoriesKeys.list(params)).toEqual(["categories", "list", params]);
	});

	test("list with partial params", () => {
		expect(
			categoriesKeys.list({ page: 2, limit: 20, active: undefined }),
		).toEqual([
			"categories",
			"list",
			{ page: 2, limit: 20, active: undefined },
		]);
	});

	test("details returns detail subset", () => {
		expect(categoriesKeys.details()).toEqual(["categories", "detail"]);
	});

	test("detail with id", () => {
		expect(categoriesKeys.detail("abc-123")).toEqual([
			"categories",
			"detail",
			"abc-123",
		]);
	});
});
