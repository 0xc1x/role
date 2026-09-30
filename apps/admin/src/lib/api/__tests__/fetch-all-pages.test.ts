import { describe, expect, it } from "bun:test";
import type { PaginatedData } from "@0xc1x/role-commons";
import { EXPORT_PAGE_SIZE, fetchAllPages } from "../fetch-all-pages";

interface Row {
	id: string;
}

interface Query extends Record<string, unknown> {
	page: number;
	limit: number;
	search?: string;
}

/** Reparte un total fijo en páginas del tamaño pedido, como lo hace la API. */
function fakeApi(total: number) {
	const calls: Query[] = [];
	const page = async (query: Query): Promise<PaginatedData<Row>> => {
		calls.push(query);
		const start = (query.page - 1) * query.limit;
		const data = Array.from(
			{
				length: Math.max(0, Math.min(query.limit, total - start)),
			},
			(_, i) => ({ id: `fila-${start + i + 1}` }),
		);
		return {
			data,
			meta: {
				page: query.page,
				limit: query.limit,
				total,
				total_pages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
			},
		};
	};
	return { page, calls };
}

describe("fetchAllPages", () => {
	it("reparte el conjunto completo, no solo la primera página", async () => {
		const total = 250;
		const api = fakeApi(total);

		const rows = await fetchAllPages(api.page, { page: 3, limit: 10 });

		// 3 páginas de 100. Devolver solo la primera (100 filas) fue
		// exactamente el defecto de alcance que esta función existe para
		// evitar.
		expect(rows).toHaveLength(total);
		expect(rows.at(0)?.id).toBe("fila-1");
		expect(rows.at(-1)?.id).toBe("fila-250");
	});

	it("ignora el page/limit de la tabla y pide el tope del servidor", async () => {
		const api = fakeApi(250);

		await fetchAllPages(api.page, { page: 3, limit: 10 });

		// `limit` de la URL (10) es el tamaño de pantalla del operador, no el
		// del archivo: usarlo dispararía 25 peticiones.
		for (const call of api.calls) expect(call.limit).toBe(EXPORT_PAGE_SIZE);
		expect(api.calls.map((c) => c.page).sort((a, b) => a - b)).toEqual([
			1, 2, 3,
		]);
	});

	it("conserva los filtros activos en cada página", async () => {
		const api = fakeApi(250);

		const rows = await fetchAllPages(api.page, {
			page: 1,
			limit: 10,
			search: "ñandú",
		});

		// Si el filtro no viajara, el archivo mezclaría el conjunto filtrado
		// con el completo y el operador no podría reproducir lo que ve.
		expect(rows).toHaveLength(250);
		for (const call of api.calls) expect(call.search).toBe("ñandú");
	});

	it("hace una sola petición cuando todo cabe en una página", async () => {
		const api = fakeApi(40);

		const rows = await fetchAllPages(api.page, { page: 1, limit: 10 });

		expect(api.calls).toHaveLength(1);
		expect(rows).toHaveLength(40);
	});

	it("no pide ninguna página extra cuando el filtro no trae filas", async () => {
		const api = fakeApi(0);

		const rows = await fetchAllPages(api.page, { page: 1, limit: 10 });

		expect(rows).toEqual([]);
		expect(api.calls).toHaveLength(1);
	});

	it("respeta el tamaño de página que le pidan", async () => {
		const api = fakeApi(95);

		const rows = await fetchAllPages(api.page, { page: 1, limit: 10 }, 50);

		expect(rows).toHaveLength(95);
		expect(api.calls.map((c) => c.page)).toEqual([1, 2]);
	});

	it("corta el recorrido si el conjunto se encogió a mitad de camino", async () => {
		// La primera página promete 150 filas y luego la segunda viene vacía:
		// sin el corte, el bucle pediría páginas para siempre.
		let call = 0;
		const rows = await fetchAllPages<Row, Query>(
			async (query) => {
				call += 1;
				if (call > 1) {
					return {
						data: [],
						meta: {
							page: query.page,
							limit: query.limit,
							total: 150,
							total_pages: 2,
						},
					};
				}
				return {
					data: Array.from({ length: 100 }, (_, i) => ({
						id: `fila-${i + 1}`,
					})),
					meta: {
						page: query.page,
						limit: query.limit,
						total: 150,
						total_pages: 2,
					},
				};
			},
			{ page: 1, limit: 10 },
		);

		expect(rows).toHaveLength(100);
	});

	it("reúne todas las páginas cuando son más que un lote de concurrencia", async () => {
		// 12 páginas: obliga a más de una tanda, que es donde un `start += N`
		// mal calculado se salta páginas.
		const api = fakeApi(1200);

		const rows = await fetchAllPages(api.page, { page: 1, limit: 10 });

		expect(rows).toHaveLength(1200);
		expect(new Set(rows.map((r) => r.id)).size).toBe(1200);
	});
});
