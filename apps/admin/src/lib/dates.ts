// El formatter se construye una sola vez a nivel de módulo: construirlo
// por render es desperdicio (es la parte costosa; formatear es barato).
const businessDateFmt = new Intl.DateTimeFormat("es-EC");

export function formatBusinessDate(raw: string): string {
	return businessDateFmt.format(new Date(raw));
}
