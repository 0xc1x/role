import { describe, expect, test } from "bun:test";
import { cn } from "@/lib/utils";

describe("cn", () => {
	test("combina clases", () => {
		expect(cn("a", "b")).toBe("a b");
		expect(cn("px-2", "px-4")).toBe("px-4");
	});
});
