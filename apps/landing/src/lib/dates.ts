// Formato de fechas legales ("12 de enero de 2026"). El formatter se
// construye una sola vez a nivel de módulo: construirlo por render es
// desperdicio (es la parte costosa; formatear es barato).
const legalDateFmt = new Intl.DateTimeFormat("es-MX", {
	year: "numeric",
	month: "long",
	day: "numeric",
});

export function formatLegalDate(raw: string): string | null {
	if (!raw) return null;
	return legalDateFmt.format(new Date(raw));
}
