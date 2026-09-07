import { describe, expect, test } from "bun:test";
import { pushKeys } from "../push.keys";
import { pushListOptions } from "../push.queries";

describe("pushKeys", () => {
	test("all returns base key", () => {
		expect(pushKeys.all).toEqual(["push"]);
	});

	test("lists returns list subset", () => {
		expect(pushKeys.lists()).toEqual(["push", "list"]);
	});

	test("list scopes by resource and params", () => {
		const q = { page: 1, limit: 10 };
		expect([...pushKeys.list("history", q)]).toEqual([
			"push",
			"list",
			"history",
			q,
		]);
	});

	test("detail scopes by id", () => {
		expect([...pushKeys.detail("abc")]).toEqual(["push", "detail", "abc"]);
	});
});

describe("pushListOptions", () => {
	test("history: queryKey segmentado por recurso y query", () => {
		const q = { page: 1, limit: 10 };
		expect([...pushListOptions.history(q).queryKey]).toEqual([
			"push",
			"list",
			"history",
			q,
		]);
	});

	test("templates: queryKey propio por recurso", () => {
		const q = { page: 1, limit: 100, active: undefined };
		expect([...pushListOptions.templates(q).queryKey]).toEqual([
			"push",
			"list",
			"templates",
			q,
		]);
	});

	test("tokens: queryKey propio por recurso", () => {
		const q = { page: 1, limit: 10, active: undefined };
		expect([...pushListOptions.tokens(q).queryKey]).toEqual([
			"push",
			"list",
			"tokens",
			q,
		]);
	});

	test("history y tokens conservan datos previos al paginar", () => {
		expect(pushListOptions.history().placeholderData).toBeDefined();
		expect(pushListOptions.tokens().placeholderData).toBeDefined();
	});

	test("queryFn presente en cada opción", () => {
		for (const opt of [
			pushListOptions.history(),
			pushListOptions.templates(),
			pushListOptions.tokens(),
		]) {
			expect(typeof opt.queryFn).toBe("function");
		}
	});
});
