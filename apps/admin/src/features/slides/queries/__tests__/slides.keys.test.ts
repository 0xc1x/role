import { describe, expect, test } from "bun:test";
import { slidesKeys } from "../slides.keys";

describe("slidesKeys", () => {
	test("all returns base key", () => {
		expect(slidesKeys.all).toEqual(["slides"]);
	});

	test("lists returns list subset", () => {
		expect(slidesKeys.lists()).toEqual(["slides", "list"]);
	});

	test("list with undefined params", () => {
		expect(slidesKeys.list()).toEqual(["slides", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, active: true };
		expect(slidesKeys.list(params)).toEqual(["slides", "list", params]);
	});
});
