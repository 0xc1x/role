// Formato de fechas legales ("12 de enero de 2026"). El formatter se
// construye una sola vez a nivel de módulo: construirlo por render es
// desperdicio (es la parte costosa; formatear es barato).
//
// `timeZone: "UTC"` NO es decorativo: es el fix. Una fecha legal es una fecha
// de calendario, no un instante, y el repositorio la escribe en convención
// ISO-8601 — `new Date("2026-01-12")` es medianoche UTC por especificación.
// Formatear ese instante en la zona del LECTOR lo recorre hacia atrás: en
// America/Guayaquil (UTC-5) el usuario leía "11 de enero de 2026" para un
// archivo que dice 12. Lo mismo pasaba en America/Bogota y America/Mexico_City,
// que comparten el offset, así que leía igual de corrido al equipo que escribe
// el documento y a la persona que lo lee.
//
// Los dos formatos que entran se resuelven con la misma zona, y por eso la
// salida ya no depende de la máquina:
//   - `YYYY-MM-DD` (el valor sembrado en create_app_config, p.ej. "2026-04-19")
//     se parsea como medianoche UTC y sale el día exacto que se escribió.
//   - Timestamp ISO con offset (p.ej. "2026-04-19T18:00:00Z") es un instante
//     real; se lee en UTC, la zona en la que se|authoró, en vez de la del
//     lector. Ecuador está detrás de UTC, así que para un datetime escrito a
//     media noche local el día no cambia; para uno escrito al otro lado del
//     meridiano cambia a favor de la zona de autoría, que es la coherente.
const legalDateFmt = new Intl.DateTimeFormat("es-MX", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
});

export function formatLegalDate(raw: string): string | null {
	if (!raw) return null;
	return legalDateFmt.format(new Date(raw));
}
