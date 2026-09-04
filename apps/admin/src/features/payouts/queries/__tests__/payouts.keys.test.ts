import { describe, expect, test } from "bun:test";
import { payoutsKeys } from "../payouts.keys";

describe("payoutsKeys", () => {
	test("all returns base key", () => {
		expect(payoutsKeys.all).toEqual(["payouts"]);
	});

	test("lists returns list subset", () => {
		expect(payoutsKeys.lists()).toEqual(["payouts", "list"]);
	});

	test("list with undefined params", () => {
		expect(payoutsKeys.list()).toEqual(["payouts", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, status: "pending" };
		expect(payoutsKeys.list(params)).toEqual(["payouts", "list", params]);
	});
});
