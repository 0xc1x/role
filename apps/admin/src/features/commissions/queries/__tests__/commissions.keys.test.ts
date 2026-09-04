import { describe, expect, test } from "bun:test";
import { commissionsKeys } from "../commissions.keys";

describe("commissionsKeys", () => {
	test("all returns base key", () => {
		expect(commissionsKeys.all).toEqual(["commissions"]);
	});

	test("lists returns list subset", () => {
		expect(commissionsKeys.lists()).toEqual(["commissions", "list"]);
	});

	test("list with undefined params", () => {
		expect(commissionsKeys.list()).toEqual(["commissions", "list", {}]);
	});

	test("list with params", () => {
		const params = {
			page: 1,
			limit: 20,
			business_id: "b-1",
			from: "2026-01-01",
		};
		expect(commissionsKeys.list(params)).toEqual([
			"commissions",
			"list",
			params,
		]);
	});

	test("details returns detail subset", () => {
		expect(commissionsKeys.details()).toEqual(["commissions", "detail"]);
	});

	test("detail with id", () => {
		expect(commissionsKeys.detail("abc-123")).toEqual([
			"commissions",
			"detail",
			"abc-123",
		]);
	});
});
