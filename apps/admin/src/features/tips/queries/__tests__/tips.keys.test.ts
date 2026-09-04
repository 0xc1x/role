import { describe, expect, test } from "bun:test";
import { tipsKeys } from "../tips.keys";

describe("tipsKeys", () => {
	test("all returns base key", () => {
		expect(tipsKeys.all).toEqual(["tips"]);
	});

	test("lists returns list subset", () => {
		expect(tipsKeys.lists()).toEqual(["tips", "list"]);
	});

	test("list with undefined params", () => {
		expect(tipsKeys.list()).toEqual(["tips", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, search: "test", active: true };
		expect(tipsKeys.list(params)).toEqual(["tips", "list", params]);
	});

	test("details returns detail subset", () => {
		expect(tipsKeys.details()).toEqual(["tips", "detail"]);
	});

	test("detail with id", () => {
		expect(tipsKeys.detail("abc-123")).toEqual(["tips", "detail", "abc-123"]);
	});
});
