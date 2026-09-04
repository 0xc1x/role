import { describe, expect, test } from "bun:test";
import { cn } from "../utils";

describe("cn", () => {
	test("combina y resuelve conflictos tailwind", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
		expect(cn("a", false && "b", "c")).toBe("a c");
	});
});
