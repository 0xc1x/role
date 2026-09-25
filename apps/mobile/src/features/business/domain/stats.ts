/** Statistics period granularity for the business stats screen. */
export type StatsPeriod = "week" | "month" | "year";

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
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
		start.setUTCDate(start.getUTCDate() + offset * 7);
		const weekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
		start.setUTCDate(start.getUTCDate() - weekday + 1);
	} else if (period === "month") {
		start.setUTCMonth(start.getUTCMonth() + offset, 1);
	} else {
		start.setUTCMonth(0, 1);
		start.setUTCFullYear(start.getUTCFullYear() + offset);
	}

	if (offset >= 0) return { start, end: new Date(now) };

	const end = new Date(start);
	if (period === "week") end.setUTCDate(end.getUTCDate() + 6);
	if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1, 0);
	if (period === "year") end.setUTCMonth(11, 31);
	end.setUTCHours(23, 59, 59, 999);
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
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic",
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
	if (period === "year") return String(end.getUTCFullYear());
	if (period === "month")
		return `${MONTH_ABBR[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
	const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
	const day = (d: Date) =>
		`${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}${sameYear ? "" : ` ${d.getUTCFullYear()}`}`;
	return `${day(start)} – ${day(end)} ${end.getUTCFullYear()}`;
}

/** KPIs derivados del agregado (puros, testeables; números sin formato). */
export function statsViewModel(stats: {
	revenue: number;
	ordersCount: number;
	avgRating: number | null;
}): { dailyAvg: (days: number) => number; avgTicket: number; rating: number } {
	return {
		dailyAvg: (days: number) =>
			stats.revenue > 0 && days > 0 ? stats.revenue / days : 0,
		avgTicket: stats.ordersCount > 0 ? stats.revenue / stats.ordersCount : 0,
		rating: stats.avgRating ?? 0,
	};
}
