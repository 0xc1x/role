import { afterEach, describe, expect, test } from "bun:test";
import type { ContactMessageDetailDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import { ContactMessageDrawer } from "../contact-message-drawer";

const previousFetch = globalThis.fetch;

const detalle: ContactMessageDetailDto = {
	id: "11111111-1111-4111-8111-111111111111",
	delivery_status: "PENDIENTE",
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-20T10:00:00.000Z",
	readable: true,
	name: "Ana",
	email: "ana@example.com",
	role: "persona",
	city: "Quito",
	excerpt: "Quiero recibir comida",
	message: "Quiero recibir comida en mi casa los viernes por la tarde.",
	city_raw: "Quito",
	city_other: null,
	received_at: "2026-09-20T10:00:00.000Z",
	ip: "203.0.113.7",
};

function renderDrawer(id: string | null = detalle.id) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ContactMessageDrawer id={id} isOpen onClose={() => undefined} />
		</QueryClientProvider>,
	);
}

function stubOk(body: unknown = detalle) {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("detalle del mensaje", () => {
	test("muestra el texto íntegro, no el extracto", async () => {
		stubOk();
		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(
					"Quiero recibir comida en mi casa los viernes por la tarde.",
				),
			).toBeDefined(),
		);
	});

	test("muestra la IP de origen, que en la lista no aparece", async () => {
		stubOk();
		renderDrawer();

		await waitFor(() => expect(screen.getByText("203.0.113.7")).toBeDefined());
	});

	test("una fila ilegible lo explica en vez de mostrar campos vacíos", async () => {
		stubOk({
			...detalle,
			readable: false,
			name: null,
			email: null,
			role: null,
			city: null,
			excerpt: null,
			message: null,
			ip: null,
		});
		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(/El contenido de este mensaje tiene un formato/),
			).toBeDefined(),
		);
	});
});

describe("requestId en el fallo", () => {
	test("el error de carga muestra el requestId de la API", async () => {
		// El `requestId` es lo único que correlaciona el aviso del operador con
		// el log del servidor. Sin él, un 500 es indistinguible de otros mil.
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					statusCode: 500,
					message: "Error interno",
					requestId: "req-abc12345",
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;

		renderDrawer();

		await waitFor(() =>
			expect(screen.getByText(/Error interno · req-abc12345/)).toBeDefined(),
		);
	});

	test("no inventa un error antes de que la consulta falle", async () => {
		stubOk();
		renderDrawer();

		// `formatApiError(null)` devuelve texto: sin el guard, el drawer abriría
		// con "Error inesperado" antes de que nada haya fallado.
		await waitFor(() => expect(screen.getByText("Ana")).toBeDefined());
		expect(screen.queryByText(/Error inesperado/)).toBeNull();
	});
});
