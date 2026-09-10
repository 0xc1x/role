/** Statistics period granularity for the business stats screen. */
export type StatsPeriod = "week" | "month" | "year";

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Date range for a stats period shifted `offset` steps from the current one
 * (0 = current, -1 = previous, …). The current period ends at `now`; past
 * periods cover the full calendar period: Monday–Sunday weeks, calendar
 * months and years.
 */
export function statsRangeFor(
	period: StatsPeriod,
	offset: number,
	now: Date = new Date(),
): { start: Date; end: Date } {
	const start = startOfDay(now);

	if (period === "week") {
		start.setDate(start.getDate() + offset * 7);
		const weekday = start.getDay() === 0 ? 7 : start.getDay();
		start.setDate(start.getDate() - weekday + 1);
	} else if (period === "month") {
		start.setMonth(start.getMonth() + offset, 1);
	} else {
		start.setMonth(0, 1);
		start.setFullYear(start.getFullYear() + offset);
	}

	if (offset >= 0) return { start, end: new Date(now) };

	const end = new Date(start);
	if (period === "week") end.setDate(end.getDate() + 6);
	if (period === "month") end.setMonth(end.getMonth() + 1, 0);
	if (period === "year") end.setMonth(11, 31);
	end.setHours(23, 59, 59, 999);
	return { start, end };
}

/** Whole calendar days covered by a stats range (inclusive on both ends). */
export function statsDaysInRange(range: { start: Date; end: Date }): number {
	const days =
		(startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) /
		DAY_MS;
	return Math.round(days) + 1;
}

const MONTH_ABBR = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
] as const;

/** Human label for a stats period+offset (labels injected to keep i18n in UI). */
export function statsRangeLabel(
	period: StatsPeriod,
	offset: number,
	labels: { thisWeek: string; thisMonth: string; thisYear: string },
	now: Date = new Date(),
): string {
	if (offset === 0) {
		if (period === "week") return labels.thisWeek;
		if (period === "month") return labels.thisMonth;
		return labels.thisYear;
	}
	const { start, end } = statsRangeFor(period, offset, now);
	if (period === "year") return String(end.getFullYear());
	if (period === "month")
		return `${MONTH_ABBR[start.getMonth()]} ${start.getFullYear()}`;
	const sameYear = start.getFullYear() === end.getFullYear();
	const day = (d: Date) =>
		`${d.getDate()} ${MONTH_ABBR[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
	return `${day(start)} – ${day(end)} ${end.getFullYear()}`;
}

/** KPIs derivados del agregado (puros, testeables). */
export function statsViewModel(stats: {
	revenue: number;
	ordersCount: number;
	avgRating: number | null;
}): { dailyAvg: (days: number) => string; avgTicket: string; rating: string } {
	return {
		dailyAvg: (days: number) =>
			stats.revenue > 0 && days > 0 ? (stats.revenue / days).toFixed(2) : "0.00",
		avgTicket:
			stats.ordersCount > 0
				? (stats.revenue / stats.ordersCount).toFixed(2)
				: "0.00",
		rating: (stats.avgRating ?? 0).toFixed(1),
	};
}
