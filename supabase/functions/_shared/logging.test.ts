import { describe, expect, test } from "bun:test";
import { safeErrorFields } from "./logging.ts";

describe("Edge safe error fields", () => {
  test("keeps only bounded type and code", () => {
    expect(safeErrorFields({ name: "PostgrestError", code: "23505" })).toEqual({
      errorType: "PostgrestError",
      errorCode: "23505",
    });
  });

  test("drops messages, stacks, and unsafe fields", () => {
    const error = {
      name: "x".repeat(100),
      code: "secret value with spaces",
      message: "service-role-key",
      stack: "private stack",
    };
    const result = safeErrorFields(error);
    expect(result).toEqual({ errorType: "UnknownError" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
