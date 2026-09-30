/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * `formatLegalDate` is what tells a reader when Rolé's terms last changed, and
 * it used to be wrong by one day for every reader west of UTC:
 * `new Date("2026-01-12")` is UTC midnight by specification, formatted in the
 * reader's local zone on a UTC-5 machine that is "11 de enero de 2026" — for a
 * document dated the 12th. Rolé's users are in Ecuador, and the seeds in
 * `create_app_config` write exactly that bare ISO date, so the legal pages
 * published a date nobody wrote.
 *
 * ─── Why the timezone is PINNED here ─────────────────────────────────────────
 *
 * This is the part that makes the test worth having. On a UTC runner the bug
 * is invisible: UTC formatting of a UTC midnight returns the same day, so a
 * test that hardcodes "12 de enero" passes on a broken `dates.ts` in CI and
 * only fails on a developer's laptop in Quito. Every case below therefore
 * re-imports the module with `process.env.TZ` set to a specific zone, and the
 * cases include the zones where the old code drifted (UTC-5) AND ones it did
 * not (UTC, UTC+14), so the assertion that matters is not a literal but the
 * invariant: the same input renders the same calendar date everywhere.
 *
 * The re-import is cache-busted on purpose — `dates.ts` builds its
 * `Intl.DateTimeFormat` at module scope, which captures the ambient zone when
 * the module is first evaluated. A plain `import` would hand back the
 * formatter built under whatever zone happened to be active, and the test would
 * silently stop testing anything.
 */
import { afterEach, describe, expect, test } from "bun:test";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

let bust = 0;
async function formatIn(tz: string, raw: string): Promise<string | null> {
	process.env.TZ = tz;
	bust += 1;
	const mod = await import(`../dates?tz=${bust}`);
	return mod.formatLegalDate(raw) as string | null;
}

describe("formatLegalDate", () => {
	// The seeded shape from supabase/migrations/*_create_app_config.sql.
	const TERMS_DATE = "2026-01-12";

	// UTC-5: Ecuador, Colombia, Mexico City, Peru, Chile. Every one of these read
	// the date one day early before the fix, and they are where the users are.
	const WEST_OF_UTC = [
		"America/Guayaquil",
		"America/Bogota",
		"America/Mexico_City",
		"America/Lima",
		"America/Santiago",
	];

	for (const tz of WEST_OF_UTC) {
		test(`"${TERMS_DATE}" reads as the 12th in ${tz} (UTC-5)`, async () => {
			// Before the fix this was "11 de enero de 2026": `new Date` parsed the
			// bare ISO date as UTC midnight and the ambient zone walked it back.
			expect(await formatIn(tz, TERMS_DATE)).toBe("12 de enero de 2026");
		});
	}

	test("renders the same calendar date in every timezone", async () => {
		// The invariant, stated once: a legal date is a calendar date, so it must
		// not depend on the machine. UTC and a UTC+14 zone are included
		// specifically because the OLD code agreed with them — a test that only
		// used those zones would have passed against the bug.
		const zones = [...WEST_OF_UTC, "UTC", "Pacific/Kiritimati", "Asia/Tokyo"];
		const rendered: string[] = [];
		for (const tz of zones) {
			rendered.push((await formatIn(tz, TERMS_DATE)) ?? "");
		}
		// Every zone must agree, and the value must be the written one.
		expect([...new Set(rendered)]).toEqual(["12 de enero de 2026"]);
		expect(rendered).toHaveLength(zones.length);
	});

	test("a full ISO timestamp is read in the zone it was authored in", async () => {
		// The other shape that can reach this function: `app_config.value_type` is
		// `'string'` for these keys, so nothing constrains an operator to the bare
		// date. An instant carries real time-of-day, so it is NOT snapped to a
		// calendar field — it is rendered, in UTC, from the instant itself.
		const instant = "2026-01-12T18:30:00Z";
		// In Ecuador that same instant is 13:30 on the 12th, so the published
		// date is the 12th in both zones — the case that must not drift.
		expect(await formatIn("America/Guayaquil", instant)).toBe(
			"12 de enero de 2026",
		);
		expect(await formatIn("UTC", instant)).toBe("12 de enero de 2026");
		// And an instant genuinely on the 13th UTC is the 13th, everywhere. This
		// is what proves the fix is not "strip the time and print the date part":
		// it must not invent a date the value does not name.
		expect(await formatIn("America/Guayaquil", "2026-01-13T02:00:00Z")).toBe(
			"13 de enero de 2026",
		);
	});

	test("a value across a month boundary keeps its own month", async () => {
		// 2026-01-01 is the case that exposes an off-by-one day as an off-by-one
		// MONTH, which is far more visible on a legal page than a shifted weekday.
		expect(await formatIn("America/Guayaquil", "2026-01-01")).toBe(
			"1 de enero de 2026",
		);
		expect(await formatIn("America/Guayaquil", "2026-03-01")).toBe(
			"1 de marzo de 2026",
		);
	});

	test("an empty value yields no badge rather than a fake date", async () => {
		// `/terms` and `/privacy` render the badge only for a non-empty result; a
		// formatted "Invalid Date" would publish a nonsense legal date.
		expect(await formatIn("America/Guayaquil", "")).toBeNull();
	});
});
