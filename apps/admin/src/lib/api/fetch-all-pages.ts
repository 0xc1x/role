import type { PaginatedData } from "@0xc1x/role-commons";

/**
 * Trae el conjunto filtrado COMPLETO de un endpoint paginado, no la página que
 * el operador está viendo.
 *
 * POR QUÉ EXISTE: un listado del back office muestra 10 filas y el filtro activo
 * puede cubrir 4.000. Exportar la página visible y llamarlo "exportar" es una
 * mentira de alcance: el operador abre la hoja, ve 10 filas y cree que ese es el
 * total, y concilia contra un subconjunto sin saberlo. Como no hay endpoint de
 * exportación (y aquí no se inventa uno), la honestidad sale de recorrer las
 * páginas que el propio `GET` ya sabe servir.
 */

/** Tope de `PaginationQuerySchema` (commons): pedir más es un 400 del servidor. */
export const EXPORT_PAGE_SIZE = 100;

/**
 * Peticiones simultáneas. Suficiente para que 40 páginas no se sientan como 40
 * esperas en serie, y bajo el límite que un operador disparando la exportación
 * reiteradamente le pide al backend sin saturarlo.
 */
const PAGE_CONCURRENCY = 5;

interface PagedQuery {
	page: number;
	limit: number;
}

/**
 * `fetchPage` es el `list` de la api del dominio: cada ruta pasa el suyo y solo
 * cambia el `page`/`limit`. Los filtros viajan en `query` intactos, así que el
 * archivo sale del mismo conjunto que la tabla.
 *
 * `page` y `limit` de `query` se ignoran a propósito: los que interesan son los
 * del recorrido.
 */
export async function fetchAllPages<T, TQuery extends PagedQuery>(
	fetchPage: (query: TQuery) => Promise<PaginatedData<T>>,
	query: TQuery,
	pageSize: number = EXPORT_PAGE_SIZE,
): Promise<T[]> {
	const first = await fetchPage({
		...query,
		page: 1,
		limit: pageSize,
	} as TQuery);
	const rows: T[] = [...first.data];
	const pageCount = Math.ceil(first.meta.total / pageSize);
	if (pageCount <= 1) return rows;

	for (let start = 2; start <= pageCount; start += PAGE_CONCURRENCY) {
		const pending: number[] = [];
		for (
			let page = start;
			page < start + PAGE_CONCURRENCY && page <= pageCount;
			page++
		) {
			pending.push(page);
		}
		const pages = await Promise.all(
			pending.map((page) =>
				fetchPage({ ...query, page, limit: pageSize } as TQuery),
			),
		);
		for (const result of pages) {
			// El conjunto se encogió entre la primera página y esta (cortes
			// borrados, órdenes canceladas). Seguir pidiendo páginas hacia una
			// `total` que ya no existe convertiría el export en un bucle
			// infinito en el peor caso, así que se corta y se entrega lo
			// reunido: el toast reporta el conteo real, no el prometido.
			if (result.data.length === 0) return rows;
			rows.push(...result.data);
		}
	}
	return rows;
}
