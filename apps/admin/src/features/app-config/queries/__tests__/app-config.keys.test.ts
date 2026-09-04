import { describe, expect, test } from "bun:test";
import { appConfigKeys } from "../app-config.keys";

describe("appConfigKeys", () => {
	test("all returns base key", () => {
		expect(appConfigKeys.all).toEqual(["app-config"]);
	});

	test("lists returns list subset", () => {
		expect(appConfigKeys.lists()).toEqual(["app-config", "list"]);
	});

	test("list with undefined params", () => {
		expect(appConfigKeys.list()).toEqual(["app-config", "list", {}]);
	});

	test("list with params", () => {
		const params = { page: 1, limit: 20, active: undefined, search: "ios" };
		expect(appConfigKeys.list(params)).toEqual(["app-config", "list", params]);
	});
});
