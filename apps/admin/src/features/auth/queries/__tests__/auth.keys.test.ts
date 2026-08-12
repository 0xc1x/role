import { describe, expect, test } from "vitest";
import { authKeys } from "../auth.keys";

describe("authKeys", () => {
	test("me returns me key", () => {
		expect(authKeys.me()).toEqual(["auth", "me"]);
	});
});
