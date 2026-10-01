import { afterEach, describe, expect, test } from "bun:test";
import type { BugReportDetailDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BugReportDrawer } from "../bug-report-drawer";

const previousFetch = globalThis.fetch;

const ID = "11111111-1111-4111-8111-111111111111";

/** URL firmada de ejemplo: el path lleva el bucket y el uid adentro, a propósito. */
const FIRMA =
	"https://proyecto.supabase.co/storage/v1/object/sign/bug_report_images/aaaaaaaa-1111-4111-8111-111111111111/captura.png?token=abc123";

const detalle: BugReportDetailDto = {
	id: ID,
	state: "ABIERTO",
	delivery_status: "PENDIENTE",
	origin: "ios",
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-20T10:00:00.000Z",
	readable: true,
	summary: "La app se cierra al pagar",
	excerpt: "La app se cierra al pagar",
	description:
		"Cierro la app en la pantalla de pago y vuelve al inicio. Me pasa desde ayer.",
	image_urls: [FIRMA],
	reporter_id: "aaaaaaaa-1111-4111-8111-111111111111",
	received_at: "2026-09-20T09:58:00.000Z",
};

function renderDrawer(id: string | null = ID) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BugReportDrawer id={id} isOpen onClose={() => undefined} />
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

/**
 * Stub que además registra las llamadas, para poder afirmar sobre el PATCH del
 * triaje: método, URL y cuerpo crudo.
 */
function stubFetchWithCalls(status: number, body: unknown) {
	const calls: { url: string; method: string; body: string | null }[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? "GET",
			body: typeof init?.body === "string" ? init.body : null,
		});
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
}

/**
 * Deja que la animación de cierre del diálogo termine.
 *
 * NO es un `waitFor` por comodidad: en este entorno (happy-dom) el `waitFor` de
 * testing-library no vuelve a Polear durante la transición de salida de un
 * `AlertDialog` de Base UI —medido: el primer poll imprime el diálogo todavía
 * presente y después el proceso se queda esperando sin volver a evaluar—. Un
 * `sleep` corto deja que React aplique el desmontaje y el assert de ausencia es
 * real en vez de un timeout de 5 s disfrazado de fallo.
 */
const settle = () => new Promise((r) => setTimeout(r, 300));

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("detalle del reporte", () => {
	test("muestra la descripción íntegra, no el extracto", async () => {
		stubOk();
		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(
					"Cierro la app en la pantalla de pago y vuelve al inicio. Me pasa desde ayer.",
				),
			).toBeDefined(),
		);
	});

	test("muestra las capturas con la URL firmada tal cual la firman", async () => {
		stubOk();
		renderDrawer();

		await waitFor(() =>
			expect(screen.getByRole("img", { name: "Captura 1" })).toBeDefined(),
		);
		// El panel NO reconstruye la ruta ni adivina el bucket: lo que descarga es
		// la URL que el API firmó, y el atributo `src` es la prueba de que la está
		// usando tal cual en vez de transformarla.
		const imagen = screen.getByRole("img", { name: "Captura 1" });
		expect(imagen.getAttribute("src")).toBe(FIRMA);
		expect(imagen.getAttribute("src")).toContain(
			"/object/sign/bug_report_images/",
		);
	});

	test("un reporte sin capturas llega igual, no se cae la vista", async () => {
		// `image_urls` puede venir vacío porque la captura ya no existe. El detalle
		// tiene que LLEGAR igual: es el texto del reporte lo que importa.
		stubOk({ ...detalle, image_urls: [] });
		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(
					"Cierro la app en la pantalla de pago y vuelve al inicio. Me pasa desde ayer.",
				),
			).toBeDefined(),
		);
		expect(screen.queryAllByRole("img")).toHaveLength(0);
	});

	test("muestra el reporter_id, que en la lista no aparece", async () => {
		stubOk();
		renderDrawer();

		// El listado es la superficie que se amplía de un vistazo; el detalle es
		// donde el operador investiga. Por eso el uid está acá y no allá.
		await waitFor(() =>
			expect(
				screen.getByText("aaaaaaaa-1111-4111-8111-111111111111"),
			).toBeDefined(),
		);
	});

	test("una fila ilegible lo explica en vez de mostrar campos vacíos", async () => {
		stubOk({
			...detalle,
			readable: false,
			summary: null,
			excerpt: null,
			description: null,
			image_urls: [],
			reporter_id: null,
		});
		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(/El contenido de este reporte tiene un formato/),
			).toBeDefined(),
		);
	});
});

describe("acciones de triaje", () => {
	test("ofrece los cinco estados y marca el actual como el que ya está", async () => {
		stubOk();
		renderDrawer();

		for (const etiqueta of [
			"Abierto",
			"En reproducción",
			"Corregido",
			"Duplicado",
			"Descartado",
		]) {
			await waitFor(() =>
				expect(screen.getByRole("button", { name: etiqueta })).toBeDefined(),
			);
		}
		// El estado vigente se anuncia, no se ofrece como algo que se pueda volver
		// a pulsar: un botón "Abierto" habilitado sobre una fila ya abierta
		// fingiría que hay un cambio pendiente.
		expect(screen.getByText("Ya está en Abierto")).toBeDefined();
	});

	test("DESCARTADO pide confirmación antes de escribir", async () => {
		const calls = stubFetchWithCalls(200, detalle);
		renderDrawer();
		// Se espera la LÍNEA DE ESTADO y no el botón: los botones existen desde el
		// render de carga, cuando `data` todavía no llegó y todos están
		// deshabilitados. Un clic sobre uno de esos no hace nada y el test pasaría
		// por el motivo equivocado.
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Descartado" }));

		// Descartar es de los dos que pierden información: el reporte deja de
		// mirarse. Un clic a ciegas no puede bastar.
		const dialogo = await screen.findByRole("alertdialog");
		expect(dialogo.textContent).toContain("descartado");
		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
	});

	test("cancelar la confirmación no escribe nada", async () => {
		const calls = stubFetchWithCalls(200, detalle);
		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Descartado" }));
		// El diálogo tiene que estar en pantalla ANTES de cancelar: sin esto, un
		// `findByRole` que se colgaría o un clic que no habría alcanzado el botón
		// harían que el test pasara sin haber probado nada.
		await screen.findByRole("alertdialog");
		fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

		await settle();
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
	});

	test("un estado que no pierde información se aplica directo, sin diálogo", async () => {
		// La confirmación es para los dos que se pierden de vista. Ponerla delante
		// de "En reproducción" sería un clic de más en cada triageo, que es
		// exactamente lo que hace que la gente deje de leerlas.
		//
		// Arranca en `ABIERTO` y se mueve a `EN_REPRODUCCION` a propósito: el botón
		// del estado VIGENTE está deshabilitado, así que una fixture que empezara
		// ya en `EN_REPRODUCCION` estaría haciendo clic en un botón inerte y
		// probaría que el panel no hace nada, no que el triaje funciona.
		const calls = stubFetchWithCalls(200, detalle);
		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "En reproducción" }));

		await waitFor(() =>
			expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1),
		);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		const patch = calls.find((c) => c.method === "PATCH");
		expect(patch?.url).toContain(`/bug-report-inbox/${ID}/state`);
		// El cuerpo lleva SOLO `state`. `delivery_status` no se manda: en esta
		// bandeja nadie lo mueve, y mandarlo sería afirmar una entrega que no pasó.
		expect(JSON.parse(patch?.body ?? "{}")).toEqual({
			state: "EN_REPRODUCCION",
		});
	});
});

describe("requestId en el fallo", () => {
	test("el error de carga muestra el requestId de la API", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					statusCode: 500,
					message: "Internal server error",
					requestId: "req-abc12345",
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;

		renderDrawer();

		await waitFor(() =>
			expect(
				screen.getByText(/Error interno del servidor · req-abc12345/),
			).toBeDefined(),
		);
	});

	test("no inventa un error antes de que la consulta falle", async () => {
		stubOk();
		renderDrawer();

		// `formatApiError(null)` devuelve texto: sin el guard, el drawer abriría
		// con "Error inesperado" antes de que nada haya fallado.
		await waitFor(() =>
			expect(screen.getByText("La app se cierra al pagar")).toBeDefined(),
		);
		expect(screen.queryByText(/Error inesperado/)).toBeNull();
	});
});
