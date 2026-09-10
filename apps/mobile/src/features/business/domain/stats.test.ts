import { describe, expect, it } from "bun:test";

import { statsDaysInRange, statsRangeFor, statsRangeLabel, statsViewModel } from "./stats";

describe("statsRangeFor", () => {
	it("current week runs from Monday to now", () => {
		const now = new Date(2026, 8, 2, 15, 30); // miércoles
		const { start, end } = statsRangeFor("week", 0, now);
		expect(start).toEqual(new Date(2026, 7, 31));
		expect(end).toEqual(now);
	});

	it("previous week is the full Monday–Sunday range", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		const { start, end } = statsRangeFor("week", -1, now);
		expect(start).toEqual(new Date(2026, 7, 24));
		expect(end).toEqual(new Date(2026, 7, 30, 23, 59, 59, 999));
	});

	it("previous week crosses the year boundary", () => {
		const now = new Date(2026, 0, 2, 10, 0); // jueves
		const { start, end } = statsRangeFor("week", -1, now);
		expect(start).toEqual(new Date(2025, 11, 22));
		expect(end).toEqual(new Date(2025, 11, 28, 23, 59, 59, 999));
	});

	it("current month starts on the 1st and ends now", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		const { start, end } = statsRangeFor("month", 0, now);
		expect(start).toEqual(new Date(2026, 8, 1));
		expect(end).toEqual(now);
	});

	it("previous month keeps its real length (Feb, non-leap)", () => {
		const now = new Date(2026, 2, 31, 12, 0);
		const { start, end } = statsRangeFor("month", -1, now);
		expect(start).toEqual(new Date(2026, 1, 1));
		expect(end).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
	});

	it("previous month handles leap February", () => {
		const now = new Date(2024, 2, 15, 12, 0);
		const { end } = statsRangeFor("month", -1, now);
		expect(end).toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));
	});

	it("previous month crosses the year boundary", () => {
		const now = new Date(2026, 0, 15, 12, 0);
		const { start, end } = statsRangeFor("month", -1, now);
		expect(start).toEqual(new Date(2025, 11, 1));
		expect(end).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
	});

	it("current year starts on Jan 1 and ends now", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		const { start, end } = statsRangeFor("year", 0, now);
		expect(start).toEqual(new Date(2026, 0, 1));
		expect(end).toEqual(now);
	});

	it("previous year is the full calendar year", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		const { start, end } = statsRangeFor("year", -1, now);
		expect(start).toEqual(new Date(2025, 0, 1));
		expect(end).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
	});
});

describe("statsDaysInRange", () => {
	it("counts full past weeks as 7 days", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		expect(statsDaysInRange(statsRangeFor("week", -1, now))).toBe(7);
	});

	it("counts elapsed days for the current period", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		expect(statsDaysInRange(statsRangeFor("month", 0, now))).toBe(2);
	});

	it("counts the real month length", () => {
		const now = new Date(2026, 3, 10, 12, 0);
		expect(statsDaysInRange(statsRangeFor("month", -1, now))).toBe(31); // marzo
	});
});

describe("statsRangeLabel", () => {
	const labels = { thisWeek: "TW", thisMonth: "TM", thisYear: "TY" };
	it("offset 0 usa etiquetas", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		expect(statsRangeLabel("week", 0, labels, now)).toBe("TW");
		expect(statsRangeLabel("month", 0, labels, now)).toBe("TM");
		expect(statsRangeLabel("year", 0, labels, now)).toBe("TY");
	});
	it("month pasado muestra mes y año", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		expect(statsRangeLabel("month", -1, labels, now)).toBe("ago 2026");
	});
	it("year pasado muestra año", () => {
		const now = new Date(2026, 8, 2, 15, 30);
		expect(statsRangeLabel("year", -1, labels, now)).toBe("2025");
	});
});

describe("statsViewModel", () => {
	it("calcula promedios y rating", () => {
		const vm = statsViewModel({ revenue: 100, ordersCount: 4, avgRating: 4.5 });
		expect(vm.dailyAvg(10)).toBe("10.00");
		expect(vm.avgTicket).toBe("25.00");
		expect(vm.rating).toBe("4.5");
	});
	it("ceros sin dividir", () => {
		const vm = statsViewModel({ revenue: 0, ordersCount: 0, avgRating: null });
		expect(vm.dailyAvg(0)).toBe("0.00");
		expect(vm.avgTicket).toBe("0.00");
		expect(vm.rating).toBe("0.0");
	});
});
