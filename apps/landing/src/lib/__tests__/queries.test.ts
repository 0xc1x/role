import { describe, expect, it } from "vitest";
import { getConfigValue } from "../queries";

describe("getConfigValue (landing)", () => {
  it("returns string value when present", () => {
    expect(getConfigValue({ k: "hello" }, "k", "fb")).toBe("hello");
  });

  it("returns fallback for missing key", () => {
    expect(getConfigValue(undefined, "k", "fb")).toBe("fb");
    expect(getConfigValue({}, "k", "fb")).toBe("fb");
  });

  it("returns fallback when value not string", () => {
    expect(getConfigValue({ k: 123 } as never, "k", "fb")).toBe("fb");
    expect(getConfigValue({ k: null } as never, "k", "fb")).toBe("fb");
  });
});
