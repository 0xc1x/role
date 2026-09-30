// El formatter se construye una sola vez a nivel de módulo: construirlo
// por render es desperdicio (es la parte costosa; formatear es barato).
//
// `timeZone` está FIJO a propósito, y no es cosmético. Sin él el texto depende
// de la zona del proceso: el servidor (Node, normalmente UTC) y el navegador del
// operador renderizarían cadenas distintas para el mismo instante, que es un
// desajuste de hidratación. La plataforma opera en Ecuador, así que la fecha que
// se muestra es la hora de Ecuador — la misma para todos, y la que espera quien
// concilia.
const BUSINESS_TIME_ZONE = "America/Guayaquil";

const businessDateFmt = new Intl.DateTimeFormat("es-EC", {
	timeZone: BUSINESS_TIME_ZONE,
});

const businessDateTimeFmt = new Intl.DateTimeFormat("es-EC", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: BUSINESS_TIME_ZONE,
});

export function formatBusinessDate(raw: string): string {
	return businessDateFmt.format(new Date(raw));
}

/** Fecha y hora de negocio en un solo formato estable (servidor == navegador). */
export function formatBusinessDateTime(raw: string): string {
	return businessDateTimeFmt.format(new Date(raw));
}
