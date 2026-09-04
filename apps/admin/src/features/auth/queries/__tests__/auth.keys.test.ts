import { describe, expect, test } from "bun:test";
import { authKeys } from "../auth.keys";

describe("authKeys", () => {
	test("me returns me key", () => {
		expect(authKeys.me()).toEqual(["auth", "me"]);
	});
});
