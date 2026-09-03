import { describe, expect, test } from "vitest";
import { couponsKeys } from "../coupons.keys";

describe("couponsKeys", () => {
	test("all returns base key", () => {
		expect(couponsKeys.all).toEqual(["coupons"]);
	});

	test("lists returns list subset", () => {
		expect(couponsKeys.lists()).toEqual(["coupons", "list"]);
	});

	test("list with undefined params", () => {
		expect(couponsKeys.list()).toEqual(["coupons", "list", {}]);
	});

	test("list with params", () => {
		const params = {
			page: 1,
			limit: 20,
			search: "test",
			is_active: true,
			global: undefined,
		};
		expect(couponsKeys.list(params)).toEqual(["coupons", "list", params]);
	});

	test("list with partial params", () => {
		expect(
			couponsKeys.list({
				page: 2,
				limit: 20,
				is_active: undefined,
				global: undefined,
			}),
		).toEqual([
			"coupons",
			"list",
			{ page: 2, limit: 20, is_active: undefined, global: undefined },
		]);
	});

	test("details returns detail subset", () => {
		expect(couponsKeys.details()).toEqual(["coupons", "detail"]);
	});

	test("detail with id", () => {
		expect(couponsKeys.detail("abc-123")).toEqual([
			"coupons",
			"detail",
			"abc-123",
		]);
	});
});
