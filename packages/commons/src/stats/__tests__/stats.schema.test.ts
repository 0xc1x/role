import { describe, expect, it } from "bun:test";
import { PlatformStatsSchema } from "../schemas/stats.schema";

describe("PlatformStatsSchema", () => {
	it("accepts stats payload", () => {
		expect(
			PlatformStatsSchema.safeParse({
				users: 1000,
				businesses: 10,
				meals_saved: 200,
			}).success,
		).toBe(true);
	});

	it("rejects negative counts", () => {
		expect(
			PlatformStatsSchema.safeParse({
				users: -1,
				businesses: 0,
				meals_saved: 0,
			}).success,
		).toBe(false);
	});

	// Guarda de seguridad del endpoint público: los conteos de marketing no
	// crecen hacia el dinero. Las métricas de plataforma viven en RevenueStats,
	// que exige rol admin.
	it("no expone campos de dinero", () => {
		expect(Object.keys(PlatformStatsSchema.shape).sort()).toEqual([
			"businesses",
			"meals_saved",
			"users",
		]);
	});
});
