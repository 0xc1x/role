import { describe, expect, test } from "bun:test";
import { contactInboxKeys } from "../contact-inbox.keys";

describe("contactInboxKeys", () => {
	test("all returns base key", () => {
		expect(contactInboxKeys.all).toEqual(["contact-inbox"]);
	});

	test("lists returns list subset", () => {
		expect(contactInboxKeys.lists()).toEqual(["contact-inbox", "list"]);
	});

	test("list with filters as params", () => {
		const params = { page: 1, limit: 20, delivery_status: "PENDIENTE" };
		expect(contactInboxKeys.list(params)).toEqual([
			"contact-inbox",
			"list",
			params,
		]);
	});

	test("details returns detail subset", () => {
		expect(contactInboxKeys.details()).toEqual(["contact-inbox", "detail"]);
	});

	test("detail with id", () => {
		expect(contactInboxKeys.detail("m-42")).toEqual([
			"contact-inbox",
			"detail",
			"m-42",
		]);
	});
});
