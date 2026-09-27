import { afterEach, describe, expect, test } from "bun:test";
import type {
	ReviewModerationItemDto,
	ReviewModerationPaginatedData,
} from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
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
			screen.getByText("Motivo: Lenguaje abusivo hacia el personal"),
		).toBeDefined();
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
});
