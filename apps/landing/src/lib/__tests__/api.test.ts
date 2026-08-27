import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiGet } from "../api";

describe("apiGet", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns json on ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 1 }) } as Response));
    await expect(apiGet("/stats/platform")).resolves.toEqual({ data: 1 });
  });

  it("throws on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    await expect(apiGet("/fail")).rejects.toThrow("respondió 500");
  });
});
