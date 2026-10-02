/**
 * Saneado de los filtros de la bandeja de reportes, fuera del archivo de ruta.
 *
 * Por qué NO vive en `_layout.reportes.tsx`: ese archivo es un componente de
 * ruta, y exportar de ahí un helper que no es componente hace dos cosas malas.
 * La primera es de lectura —quien abre la ruta a buscar "la tabla" encuentra un
 * `parseBugReportsSearch`— y la segunda es de gate: `react-doctor` marca
 * `only-export-components`, y el warning es cierto aunque el helper sea
 * inocuo.
 *
 * QUÉ HACE, y por qué no alcanza con parsear: `ListBugReportsQuerySchema` es un
 * `z.enum`, así que un token desconocido —`?state=REABIERTO`— tiraría dentro de
 * `validateSearch`, el router lo envolvería en `SearchParamError` y reemplazaría
 * la página entera por el "Something went wrong!" de TanStack.
 *
 * En esta sección un estado desconocido NO es una hipótesis: el API estrecha
 * `state` contra el vocabulario y cae a `null`, y el contrato lo dice. O sea que
 * un token viejo en una URL guardada es un hecho esperado, no un caso raro.
 *
 * Lo que sale del sanitario tampoco se pierde: un filtro que no existe se
 * devuelve sin filtrar, que es lo que el operador quiere de un link viejo, y
 * `page`/`limit` siguen tirando a propósito —un `?page=abc` sí es un link
 * malformado y no hay a qué caerse.
 */

import {
	BUG_TRIAGE_STATES,
	ENTRY_ORIGINS,
	type ListBugReportsQuery,
	ListBugReportsQuerySchema,
} from "@0xc1x/role-commons";

/**
 * `undefined` cuando el valor no es string (o no viene), y `undefined` también
 * cuando es un string fuera del vocabulario: el filtro se ignora en vez de
 * romper la página.
 */
function soloDelVocabulario<T extends string>(
	valor: unknown,
	vocabulario: readonly T[],
): T | undefined {
	return typeof valor === "string"
		? vocabulario.find((conocido) => conocido === valor)
		: undefined;
}

export function parseBugReportsSearch(
	raw: Record<string, unknown>,
): ListBugReportsQuery {
	return ListBugReportsQuerySchema.parse({
		...raw,
		state: soloDelVocabulario(raw.state, BUG_TRIAGE_STATES),
		origin: soloDelVocabulario(raw.origin, ENTRY_ORIGINS),
	});
}
