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

/**
 * ¿Es un instante que `Date` puede formatear?
 *
 * `new Date("ayer")` es un `Date` INVÁLIDO, y no es un caso hipotético: en este
 * panel hay al menos un campo de fecha que no viene de Postgres sino del
 * `value` de una fila escrita por un cliente, y el `WITH CHECK` de la policy de
 * insert no mira `value` en absoluto. El tipo del contrato lo declara
 * `z.string().nullable()` —o sea `z.string().min(1)`, que no valida formato—, así
 * que un string vacío de sentido llega intacto hasta acá.
 *
 * Y `Intl.DateTimeFormat.format` no lanza un error legible: lanza
 * `RangeError: Invalid time value`, que en un componente de React sube hasta el
 * `CatchBoundary` del ROOT y deja el panel entero sin barra lateral. Medido con
 * el árbol de rutas real: `SIDEBAR_VIVA: false`.
 */
function esInstanteValido(raw: string): boolean {
	return !Number.isNaN(new Date(raw).getTime());
}

/**
 * POR QUÉ LA GUARDA VIVE ACÁ Y NO EN EL CALLER, y no es una cuestión de gusto.
 *
 * Este módulo es el ÚNICO lugar del panel donde se llama a `Intl.DateTimeFormat`.
 * Una guarda en el drawer que consume el valor protegería ese drawer y solo ese:
 * el mismo `formatBusinessDateTime` ya se usa para `created_at` dos líneas más
 * arriba, para la columna "Recibido" de la tabla, y —preexistente y sin
 * cubrir— en el drawer de la bandeja de contactos. Cuatro superficies, cuatro
 * guards que alguien tiene que acordarse de escribir, y la quinta se rompe en
 * silencio. Acá hay una guarda y se aplica a todas por construcción.
 *
 * QUÉ DEVUELVE CUANDO NO PUEDE FORMATEAR: el string crudo, no un guion. Un guion
 * es la marca de "sin informar" que usa `DetailField`, así que devolverlo
 * volvería indistinguibles dos hechos distintos —"el cliente no mandó este
 * campo" y "el campo vino con un valor que no es una fecha"— que son la
 * diferencia entre un reporte viejo y uno corrupto. El valor crudo además es lo
 * que el operador necesita para reportarlo: dice QUÉ escribió el cliente, que es
 * la mitad de diagnosticar el bug.
 *
 * Y el riesgo de que ese crudo sea enorme es acotado por construcción: ningún
 * escritor del repo produce un `at` largo —el móvil lo sella con
 * `new Date().toISOString()` y ni siquiera lo acepta como input—, así que el caso
 * real es un token corto escrito a mano ("ayer", "null", "0"), no cinco
 * megabytes.
 */
export function formatBusinessDate(raw: string): string {
	if (!esInstanteValido(raw)) return raw;
	return businessDateFmt.format(new Date(raw));
}

/** Fecha y hora de negocio en un solo formato estable (servidor == navegador). */
export function formatBusinessDateTime(raw: string): string {
	if (!esInstanteValido(raw)) return raw;
	return businessDateTimeFmt.format(new Date(raw));
}
