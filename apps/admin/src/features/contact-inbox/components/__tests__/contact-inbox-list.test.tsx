import { afterEach, describe, expect, test } from "bun:test";
import type {
	ContactMessageListItemDto,
	ContactMessagePaginatedData,
} from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import { ContactInboxList } from "../contact-inbox-list";

const previousFetch = globalThis.fetch;

const legible: ContactMessageListItemDto = {
	id: "11111111-1111-4111-8111-111111111111",
	status: "PENDIENTE",
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-20T10:00:00.000Z",
	readable: true,
	name: "Ana",
	email: "ana@example.com",
	role: "persona",
	city: "Quito",
	excerpt: "Quiero recibir comida en mi casa",
};

const ilegible: ContactMessageListItemDto = {
	...legible,
	id: "22222222-2222-4222-8222-222222222222",
	readable: false,
	name: null,
	email: null,
	role: null,
	city: null,
	excerpt: null,
};

const sobre = (
	data: ContactMessageListItemDto[],
): ContactMessagePaginatedData => ({
	data,
	meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
});

/** Devuelve las URLs pedidas para poder afirmar sobre el filtro. */
function stubFetch(data: ContactMessageListItemDto[]) {
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
	props: Partial<Parameters<typeof ContactInboxList>[0]> = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ContactInboxList
				page={1}
				limit={20}
				onPageChange={() => undefined}
				onStatusChange={() => undefined}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("listado de la bandeja", () => {
	test("renderiza los mensajes con nombre, correo, ciudad y extracto", async () => {
		stubFetch([legible]);
		renderList();

		await waitFor(() => expect(screen.getByText("Ana")).toBeDefined());
		expect(screen.getByText("ana@example.com")).toBeDefined();
		expect(screen.getByText("Quito")).toBeDefined();
		expect(screen.getByText("Quiero recibir comida en mi casa")).toBeDefined();
	});

	test("etiqueta el estado por la entrega del aviso, no como lectura", async () => {
		stubFetch([legible]);
		renderList();

		// "Pendiente" a secas haría leer la fila como "sin leer". El `status` de
		// app_store habla de la entrega del correo de aviso.
		await waitFor(() =>
			expect(screen.getByText("Entrega pendiente")).toBeDefined(),
		);
		expect(screen.queryByText("Pendiente")).toBeNull();
	});

	test("una fila ilegible se lista y lo dice, en vez de mostrar guiones", async () => {
		stubFetch([ilegible]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("Sin datos legibles")).toBeDefined(),
		);
	});

	test("no muestra la IP en la lista", async () => {
		stubFetch([legible]);
		renderList();

		await waitFor(() => expect(screen.getByText("Ana")).toBeDefined());
		// La IP solo va en el detalle; la lista no la pide ni la muestra.
		expect(screen.queryByText(/203\.0\.113/)).toBeNull();
	});

	test("sin filas informa que no hay mensajes con ese filtro", async () => {
		stubFetch([]);
		renderList();

		await waitFor(() =>
			expect(
				screen.getByText("No hay mensajes de contacto con este filtro."),
			).toBeDefined(),
		);
	});
});

describe("filtro por estado", () => {
	test("sin filtro no manda status en la URL", async () => {
		const urls = stubFetch([legible]);
		renderList();

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).not.toContain("status=");
	});

	test("con filtro pide solo ese estado a la API", async () => {
		const urls = stubFetch([legible]);
		renderList({ status: "PENDIENTE" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("status=PENDIENTE");
	});
});
