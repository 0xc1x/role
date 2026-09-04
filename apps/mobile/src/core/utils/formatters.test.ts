import { describe, expect, test } from "bun:test";
import {
	formatCount,
	formatDateTime,
	formatDistanceKm,
	formatMoney,
	formatPercent,
	formatRelativeTime,
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";

describe("formatters", () => {
	test("formatMoney sin decimales", () => {
		expect(formatMoney(3990)).toContain("3,990");
	});

	test("formatPercent redondea", () => {
		expect(formatPercent(59.6)).toBe("60%");
	});

	test("formatTime y inválidos", () => {
		expect(formatTime("no-fecha")).toBe("—");
		expect(formatTime("2025-06-01T09:05:00")).toMatch(/^\d{2}:\d{2}$/);
	});

	test("formatDateTime/formatShortDate", () => {
		expect(formatDateTime("2025-07-12T14:30:00")).toBe("12 de jul, 14:30");
		expect(formatShortDate("2025-07-12T14:30:00")).toContain("2025");
		expect(formatShortDate("x")).toBe("—");
	});

	test("formatRelativeTime", () => {
		expect(formatRelativeTime(new Date().toISOString())).toBe("ahora");
		expect(
			formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString()),
		).toBe("hace 5 min");
		expect(formatRelativeTime("x")).toBe("—");
	});

	test("formatCount/formatDistanceKm", () => {
		expect(formatCount(999)).toBe("999");
		expect(formatCount(1500)).toBe("1.5k");
		expect(formatDistanceKm(0.45)).toBe("450m");
		expect(formatDistanceKm(1.25)).toBe("1.3km");
	});
});
