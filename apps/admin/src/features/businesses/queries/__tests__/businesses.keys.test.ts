import { describe, expect, test } from "bun:test";
import { businessesKeys } from "../businesses.keys";

describe("businessesKeys", () => {
	test("all returns base key", () => {
		expect(businessesKeys.all).toEqual(["businesses"]);
	});

	test("lists returns list subset", () => {
		expect(businessesKeys.lists()).toEqual(["businesses", "list"]);
	});

	test("list with params", () => {
		const params = {
			page: 1,
			limit: 20,
			search: "cafe",
			verification_status: "pending",
		};
		expect(businessesKeys.list(params)).toEqual(["businesses", "list", params]);
	});

	test("details returns detail subset", () => {
		expect(businessesKeys.details()).toEqual(["businesses", "detail"]);
	});

	test("detail with id", () => {
		expect(businessesKeys.detail("abc-123")).toEqual([
			"businesses",
			"detail",
			"abc-123",
		]);
	});
});
