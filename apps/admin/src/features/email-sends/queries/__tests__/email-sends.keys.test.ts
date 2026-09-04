import { describe, expect, test } from "bun:test";
import { emailSendsKeys } from "../email-sends.keys";

describe("emailSendsKeys", () => {
	test("all returns base key", () => {
		expect(emailSendsKeys.all).toEqual(["email-sends"]);
	});

	test("lists returns list subset", () => {
		expect(emailSendsKeys.lists()).toEqual(["email-sends", "list"]);
	});

	test("list with filters as params", () => {
		const params = {
			page: 1,
			limit: 20,
			status: "failed",
			type: "transactional",
			search: "ana@",
		};
		expect(emailSendsKeys.list(params)).toEqual([
			"email-sends",
			"list",
			params,
		]);
	});

	test("details returns detail subset", () => {
		expect(emailSendsKeys.details()).toEqual(["email-sends", "detail"]);
	});

	test("detail with id", () => {
		expect(emailSendsKeys.detail("s-42")).toEqual([
			"email-sends",
			"detail",
			"s-42",
		]);
	});
});
