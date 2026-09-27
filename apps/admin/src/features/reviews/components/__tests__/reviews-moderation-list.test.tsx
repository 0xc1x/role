import { afterEach, describe, expect, mock, test } from "bun:test";
import type {
	ReviewModerationItemDto,
	ReviewModerationPaginatedData,
} from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { ReviewsModerationList } from "../reviews-moderation-list";

const previousFetch = globalThis.fetch;

const visible: ReviewModerationItemDto = {
	id: "11111111-1111-4111-8111-111111111111",
	user_id: "aaaaaaaa-1111-4111-8111-111111111111",
	business_id: "bbbbbbbb-1111-4111-8111-111111111111",
	order_id: null,
	rating: null,
	comment: "Todo Excelente",
	product_rating: 5,
	business_rating: 5,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-20T10:00:00.000Z",
	is_hidden: false,
	moderated_at: null,
	moderated_by: null,
	moderated_by_name: null,
	moderation_reason: null,
	hidden_reason: null,
	author_name: "Ana",
	business_name: "Panadería Sur",
};

const oculta: ReviewModerationItemDto = {
	...visible,
	id: "22222222-2222-4222-8222-222222222222",
	comment: "Pésimo, no volvamos",
	product_rating: 1,
	business_rating: 1,
	is_hidden: true,
	moderated_at: "2026-09-21T12:00:00.000Z",
	moderated_by: "cccccccc-1111-4111-8111-111111111111",
	moderated_by_name: "Módulo de moderación",
	moderation_reason: "insults_or_hate_speech",
	hidden_reason: "Lenguaje abusivo hacia el personal",
};

const sobre = (
	data: ReviewModerationItemDto[],
): ReviewModerationPaginatedData => ({
	data,
	meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
});

function stubFetch(data: ReviewModerationItemDto[]) {
	const urls: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		urls.push(String(input));
		return new Response(JSON.stringify(sobre(data)), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return urls;
}

/**
 * Igual que `stubFetch`, pero con la respuesta caída y contando las peticiones.
 * El conteo es lo que permite distinguir "volvió a pedir los datos" de "no pasó
 * nada": un botón que solo navega deja el contador igual.
 */
function stubFailingFetch(requestId: string) {
	const urls: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		urls.push(String(input));
		return new Response(
			JSON.stringify({
				statusCode: 500,
				message: "Internal server error",
				requestId,
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}) as unknown as typeof fetch;
	return urls;
}

function renderList(
	props: Partial<Parameters<typeof ReviewsModerationList>[0]> = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ReviewsModerationList
				page={1}
				limit={20}
				visibility="all"
				onPageChange={() => undefined}
				onFilterChange={() => undefined}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("listado de la bandeja de reseñas", () => {
	test("renderiza autor, reseña, puntaje y negocio", async () => {
		stubFetch([visible]);
		renderList();

		await waitFor(() => expect(screen.getByText("Ana")).toBeDefined());
		expect(screen.getByText("Todo Excelente")).toBeDefined();
		expect(screen.getByText("5 / 5")).toBeDefined();
		expect(screen.getByText("Panadería Sur")).toBeDefined();
	});

	test("una reseña sin nombre se lista y lo dice, en vez de mostrar guiones", async () => {
		stubFetch([{ ...visible, author_name: null }]);
		renderList();

		await waitFor(() => expect(screen.getByText("Sin nombre")).toBeDefined());
	});

	test("una reseña sin puntaje lo dice, en vez de inventar un 0", async () => {
		stubFetch([
			{ ...visible, product_rating: null, business_rating: null, rating: null },
		]);
		renderList();

		await waitFor(() => expect(screen.getByText("Sin puntaje")).toBeDefined());
	});

	test("etiqueta la visibilidad como Oculta/Visible, nunca como eliminada", async () => {
		stubFetch([visible, oculta]);
		renderList();

		await waitFor(() => expect(screen.getByText("Visible")).toBeDefined());
		expect(screen.getByText("Oculta")).toBeDefined();
		// "Eliminada" sería mentira: la fila se conserva y se puede revertir.
		expect(screen.queryByText("Eliminada")).toBeNull();
	});

	test("una reseña nunca moderada dice Sin moderar, sin fecha inventada", async () => {
		stubFetch([visible]);
		renderList();

		await waitFor(() => expect(screen.getByText("Sin moderar")).toBeDefined());
	});

	test("una reseña oculta muestra QUIÉN la ocultó, CUÁNDO y POR QUÉ", async () => {
		stubFetch([oculta]);
		renderList();

		await waitFor(() => expect(screen.getByText("Oculta")).toBeDefined());
		expect(screen.getByText(/Módulo de moderación/)).toBeDefined();
		expect(
			screen.getByText("Detalle: Lenguaje abusivo hacia el personal"),
		).toBeDefined();
	});

	test("el motivo se muestra con su etiqueta en español, no con el token", async () => {
		stubFetch([oculta]);
		renderList();

		// El token es lo que se guarda y se filtra; la etiqueta es lo que la
		// persona lee. `insults_or_hate_speech` en la tabla sería ininteligible.
		await waitFor(() =>
			expect(
				screen.getByText("Insultos, acoso o lenguaje de odio"),
			).toBeDefined(),
		);
		expect(screen.queryByText("insults_or_hate_speech")).toBeNull();
	});

	test("una razón nombrada sin detalle no inventa un texto debajo del motivo", async () => {
		stubFetch([{ ...oculta, hidden_reason: null }]);
		renderList();

		await waitFor(() =>
			expect(
				screen.getByText("Insultos, acoso o lenguaje de odio"),
			).toBeDefined(),
		);
		// El detalle es opcional para un motivo nombrado: su ausencia es un dato,
		// no algo que la tabla deba rellenar con un texto de relleno.
		expect(screen.queryByText(/Detalle:/)).toBeNull();
	});

	test("un token que el contrato ya no conoce se muestra crudo, no como «Desconocido»", async () => {
		stubFetch([{ ...oculta, moderation_reason: "motivo_retirado" }]);
		renderList();

		// Es un caso real —un motivo retirado del contrato con reseñas ya
		// moderadas— y un texto de relleno escondería que la fila dice algo que el
		// panel ya no sabe nombrar.
		await waitFor(() =>
			expect(screen.getByText("motivo_retirado")).toBeDefined(),
		);
	});

	test("una fila sin motivo lo dice con sus palabras, no con las de la otra columna", async () => {
		stubFetch([visible]);
		renderList();

		// "Sin moderar" es el hecho de la columna de moderación (nunca se tocó);
		// "sin motivo registrado" es el de esta. Reusar el mismo texto daría dos
		// celdas idénticas y, peor, affirmaría que una fila visible nunca pasó por
		// moderación cuando puede haber pasado y luego desocultarse.
		await waitFor(() => expect(screen.getByText("Sin moderar")).toBeDefined());
		expect(screen.getByText("Sin motivo registrado")).toBeDefined();
	});

	test("una fila desocultada conserva su motivo visible en la columna", async () => {
		stubFetch([{ ...oculta, is_hidden: false }]);
		renderList();

		// El motivo sobrevive al desocultamiento: por eso la columna se llama
		// "Motivo" y no "Motivo vigente".
		await waitFor(() =>
			expect(
				screen.getByText("Insultos, acoso o lenguaje de odio"),
			).toBeDefined(),
		);
		expect(screen.getByText("Visible")).toBeDefined();
	});

	test("sin filas informa que no hay reseñas con ese filtro", async () => {
		stubFetch([]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("No hay reseñas con este filtro.")).toBeDefined(),
		);
	});
});

describe("filtros de la bandeja", () => {
	test("manda la visibilidad en la URL", async () => {
		const urls = stubFetch([visible]);
		renderList({ visibility: "hidden" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("visibility=hidden");
	});

	test("sin filtro de puntaje no manda rating en la URL", async () => {
		const urls = stubFetch([visible]);
		renderList();

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).not.toContain("rating=");
	});

	test("el filtro de puntaje viaja a la URL", async () => {
		const urls = stubFetch([visible]);
		renderList({ rating: 1 });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("rating=1");
	});

	test("sin filtro de motivo no manda moderation_reason en la URL", async () => {
		const urls = stubFetch([visible]);
		renderList();

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).not.toContain("moderation_reason=");
	});

	test("el filtro de motivo viaja a la URL con el token, no con la etiqueta", async () => {
		const urls = stubFetch([visible]);
		renderList({ moderationReason: "identity_discrimination" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("moderation_reason=identity_discrimination");
		// La etiqueta tiene acentos y comas: mandarla en la URL rompería el
		// `toSearchParams` y el filtro dejaría de ser reproducible.
		expect(urls[0]).not.toContain("Discriminaci");
	});

	test("el selector de motivo se arma desde la taxonomía del contrato", async () => {
		stubFetch([visible]);
		renderList();

		await waitFor(() => expect(screen.getByText("Ana")).toBeDefined());
		fireEvent.click(screen.getByRole("combobox", { name: "Motivo" }));

		// Un motivo nuevo en commons aparece en este selector sin tocar la vista.
		expect(
			await screen.findByRole("option", {
				name: "Contenido no relacionado o automatizado",
			}),
		).toBeDefined();
		expect(
			screen.getByRole("option", { name: "Cualquier motivo" }),
		).toBeDefined();
	});
});

describe("fallo al cargar la bandeja", () => {
	test("muestra el requestId para que soporte pueda correlacionar", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					statusCode: 500,
					message: "Internal server error",
					requestId: "a1b2c3d4e5f6",
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;

		renderList();

		await waitFor(() =>
			expect(
				screen.getByText(/Error interno del servidor · a1b2c3d4e5f6/),
			).toBeDefined(),
		);
	});

	test("el fallo se pinta junto a su 'Reintentar', no como pantalla en blanco", async () => {
		stubFailingFetch("b3c4d5e6f7a8");
		renderList();

		await waitFor(() =>
			expect(
				screen.getByText(/Error interno del servidor · b3c4d5e6f7a8/),
			).toBeDefined(),
		);
		// El mensaje y el botón se pintan en la misma rama: un error sin salida
		// deja al operador leyendo un 500 sin más remedio que recargar el
		// navegador a mano.
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
		// Y no es una lista vacía. "No hay reseñas con este filtro" affirmaría
		// que moderationFilter corrió y no encontró nada, que es un hecho
		// distinto —y falso— del que un fallo de red insinúa.
		expect(screen.queryByText("No hay reseñas con este filtro.")).toBeNull();
	});

	test("'Reintentar' vuelve a pedir la lista en vez de navegar a la misma página", async () => {
		const urls = stubFailingFetch("c4d5e6f7a8b9");
		const onPageChange = mock(() => undefined);
		renderList({ onPageChange });

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = urls.length;
		fireEvent.click(retry);

		await waitFor(() => expect(urls.length).toBeGreaterThan(before));
		// El defecto: el botón llamaba `onPageChange(1)`. Con la URL ya en
		// `?page=1` esa navegación es nula —el router la deduplica y React Query
		// conserva la query errored bajo la misma key—, así que el operador hacía
		// clic y no pasaba absolutamente nada. Reintentar es refetchar la misma
		// consulta, no volver a la página 1.
		expect(onPageChange).not.toHaveBeenCalled();
	});
});
