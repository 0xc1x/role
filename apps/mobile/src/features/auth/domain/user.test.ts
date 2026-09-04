import { describe, expect, test } from "bun:test";
import { parseRole } from "@/features/auth/domain/user";

describe("parseRole", () => {
	test("roles conocidos", () => {
		expect(parseRole("business")).toBe("business");
		expect(parseRole("admin")).toBe("admin");
		expect(parseRole("user")).toBe("user");
	});

	test("desconocidos y nulos → user", () => {
		expect(parseRole("superadmin")).toBe("user");
		expect(parseRole("")).toBe("user");
		expect(parseRole(null)).toBe("user");
		expect(parseRole(undefined)).toBe("user");
	});
});
