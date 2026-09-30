/**
 * es-MX month and weekday names — single source of truth.
 *
 * These are locale DATA, not UI copy. They live beside `strings.ts` because
 * they are part of the same i18n concern, but they are a separate module so
 * `domain/` and `data/` layers can import them without pulling in the 82KB copy
 * catalog. Do not add them to `strings.ts` and do not create a barrel here.
 *
 * The three month case variants are INTENTIONAL Spanish typography, not drift:
 * a full month name that starts a label is capitalized, while one embedded
 * mid-sentence stays lowercase. Keep all three; never "simplify" to one.
 *
 * The same reasoning applies to the DAY case variants: `DAYS_SHORT_CAP_ES` is
 * the capitalized form used to open a label (a chart bucket that starts with
 * the weekday), while `DAYS_SHORT_ES` stays lowercase for mid-sentence use.
 * Keep both; never "simplify" to one.
 *
 * `DAYS_SHORT_ES` and `DAYS_SHORT_CAP_ES` are indexed by `Date#getDay()`, so
 * index 0 is Sunday.
 */
export const MONTHS_SHORT_ES = [
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

export const MONTHS_FULL_ES = [
	"enero",
	"febrero",
	"marzo",
	"abril",
	"mayo",
	"junio",
	"julio",
	"agosto",
	"septiembre",
	"octubre",
	"noviembre",
	"diciembre",
] as const;

export const MONTHS_FULL_CAP_ES = [
	"Enero",
	"Febrero",
	"Marzo",
	"Abril",
	"Mayo",
	"Junio",
	"Julio",
	"Agosto",
	"Septiembre",
	"Octubre",
	"Noviembre",
	"Diciembre",
] as const;

/** Index 0 = Sunday, matching `Date#getDay()`. */
export const DAYS_SHORT_ES = [
	"dom",
	"lun",
	"mar",
	"mié",
	"jue",
	"vie",
	"sáb",
] as const;

/** Index 0 = Sunday, matching `Date#getDay()`. */
export const DAYS_SHORT_CAP_ES = [
	"Dom",
	"Lun",
	"Mar",
	"Mié",
	"Jue",
	"Vie",
	"Sáb",
] as const;
