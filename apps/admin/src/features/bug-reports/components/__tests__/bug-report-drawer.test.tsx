import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { BugReportDetailDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
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
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("detalle del reporte", () => {
	test("el resumen llega íntegro, aunque la lista lo recorte", async () => {
		// La mitad de I2: el listado elige qué se ve de un vistazo y el detalle
		// conserva el texto entero. Si esta mitad no existiera, truncar en la
		// celda sería perder el texto del usuario — que es exactamente lo que
		// commons argumenta al no truncar en lectura.
		const largo = "C".repeat(400);
		stubOk({ ...detalle, summary: largo, excerpt: `${largo.slice(0, 157)}…` });
		renderDrawer();

		await waitFor(() => expect(screen.getByText(largo)).toBeDefined());
		expect(screen.queryByText(`${largo.slice(0, 157)}…`)).toBeNull();
	});

	test("un `at` que no es una fecha no revienta el panel", async () => {
		// La cadena del I1 completa, del lado del componente: el mapper copia
		// `value.at` verbatim porque el contrato lo declara `z.string().nullable()`
		// —o sea `z.string().min(1)`, sin validar formato— y la policy de insert no
		// mira `value`. Sin la guarda de `lib/dates.ts`, este `formatBusinessDateTime`
		// lanzaba `RangeError` y en el árbol real eso se llevaba el panel entero
		// con su barra lateral.
		stubOk({ ...detalle, received_at: "ayer" });
		renderDrawer();

		await waitFor(() => expect(screen.getByText("ayer")).toBeDefined());
		// Y el resto de la ficha sigue en pantalla: un `at` corrupto no puede
		// costarle al operador el reporte.
		expect(
			screen.getByText(
				"Cierro la app en la pantalla de pago y vuelve al inicio. Me pasa desde ayer.",
			),
		).toBeDefined();
	});

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

	test("una captura vencida lo dice, en vez de dejar un ícono roto", async () => {
		stubOk();
		renderDrawer();
		await waitFor(() =>
			expect(screen.getByRole("img", { name: "Captura 1" })).toBeDefined(),
		);

		// La firma caduca a los 5 minutos y el drawer se queda abierto mientras el
		// operador triaje, así que esto es el caso NORMAL de la pantalla, no una
		// rareza. Un ícono roto no distingue "el usuario no mandó captura" de "la
		// captura ya no existe", y solo la segunda es un problema.
		fireEvent.error(screen.getByRole("img", { name: "Captura 1" }));

		await waitFor(() =>
			expect(screen.getByText(/Captura 1: ya no se puede ver/)).toBeDefined(),
		);
		expect(screen.queryByRole("img", { name: "Captura 1" })).toBeNull();
		// Y el texto del reporte sigue en pantalla: perder una captura no puede
		// costingle al operador el reporte entero.
		expect(
			screen.getByText(
				"Cierro la app en la pantalla de pago y vuelve al inicio. Me pasa desde ayer.",
			),
		).toBeDefined();
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

describe("el pie nunca afirma un triaje que no sabe", () => {
	// LAS TRES RAMAS. `state` es `BugTriageState | null | undefined` y los tres
	// casos son hechos distintos: hay un estado, hay un `null` porque el API
	// estrechó a la fuerza un token fuera de vocabulario, o no hay dato porque la
	// consulta está en vuelo o falló. El pie tiene que distinguirlos los tres, y
	// no dos.
	test("mientras carga, el pie no dice 'Sin triar'", async () => {
		// Un fetch que NO resuelve: el drawer queda en el estado de carga para
		// siempre, que es la forma de mirar esa rama sin depender de tiempos.
		globalThis.fetch = (async () =>
			new Promise(() => undefined)) as unknown as typeof fetch;
		renderDrawer();

		// "Sin triar" acá afirmaría un hecho sobre una fila que el panel todavía
		// no tiene. El operador leería un spinner como "este reporte no está
		// triado" y lo dejaría para el final de la cola.
		await waitFor(() =>
			expect(screen.getByText("Cargando reporte")).toBeDefined(),
		);
		expect(screen.queryByText("Sin triar")).toBeNull();
		expect(screen.queryByText(/Ya está en/)).toBeNull();
		expect(screen.getByText("—")).toBeDefined();
	});

	test("con la API en 500, el pie no dice 'Sin triar' tampoco", async () => {
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
				screen.getByText("Error interno del servidor · req-abc12345"),
			).toBeDefined(),
		);
		// Esta es la que duele: la pantalla de arriba dice que no se pudo cargar y
		// el pie afirma que el reporte está sin triagear. Un 500 se leería como un
		// triageo pendiente, que es el error más caro de los tres.
		expect(screen.queryByText("Sin triar")).toBeNull();
		expect(screen.getByText("—")).toBeDefined();
	});

	test("con el dato cargado y sin triage, el pie sí dice 'Sin triar'", async () => {
		// La tercera rama: acá el panel SABE que no hay triaje, y el texto es
		// distinto del "—" porque el hecho es otro. Sin este test, arreglar las dos
		// anteriores poniendo "—" en todas partes también lo habría pasado.
		stubOk({ ...detalle, state: null });
		renderDrawer();

		// DOS elementos y no uno: el badge del cuerpo y la línea del pie. Que
		// coincidan es la garantía —que los dos digan lo mismo del mismo hecho— y
		// el conteo es lo que la verifica.
		await waitFor(() =>
			expect(screen.getAllByText("Sin triar")).toHaveLength(2),
		);
		expect(screen.queryByText("Ya está en Abierto")).toBeNull();
		// Y el pie NO cayó en la rama de "no sé": el "—" suelto solo aparece
		// cuando no hay dato, así que su ausencia es lo que distingue esta rama de
		// las otras dos. (Los `— sin informar —` de la ficha no cuentan: son otro
		// texto y viven en otro elemento.)
		expect(screen.queryByText("—")).toBeNull();
	});
});

describe("acciones de triaje", () => {
	test("ofrece los cinco estados y marca el actual como el que ya está", async () => {
		stubOk();
		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		for (const etiqueta of [
			"En reproducción",
			"Corregido",
			"Duplicado",
			"Descartado",
		]) {
			expect(screen.getByRole("button", { name: etiqueta })).toBeDefined();
		}
	});

	test("el estado vigente NO se puede volver a pulsar", async () => {
		// El invariante que sostiene el test de "se aplica directo": si el botón
		// del estado actual estuviera habilitado, ese test pasaría por un motivo
		// equivocado (un clic inerte se parece a un PATCH que no se dispara).
		// Y para el operador un "Abierto" pulsable sobre una fila ya abierta
		// fingiría que hay un cambio pendiente.
		stubOk();
		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		const vigente = screen.getByRole("button", { name: "Abierto" });
		expect((vigente as HTMLButtonElement).disabled).toBe(true);
		// Y los otros cuatro sí, que es lo que hace que el cinco sea usable.
		for (const etiqueta of [
			"En reproducción",
			"Corregido",
			"Duplicado",
			"Descartado",
		]) {
			const b = screen.getByRole("button", { name: etiqueta });
			expect((b as HTMLButtonElement).disabled).toBe(false);
		}
	});

	test("sin dato cargado los cinco están deshabilitados", async () => {
		globalThis.fetch = (async () =>
			new Promise(() => undefined)) as unknown as typeof fetch;
		renderDrawer();

		await waitFor(() =>
			expect(screen.getByText("Cargando reporte")).toBeDefined(),
		);
		// Un botón habilitado que no hace nada es peor que uno que visiblemente no
		// está: sin dato cargado no hay a qué escribirle el triaje.
		for (const etiqueta of [
			"Abierto",
			"En reproducción",
			"Corregido",
			"Duplicado",
			"Descartado",
		]) {
			const b = screen.getByRole("button", { name: etiqueta });
			expect((b as HTMLButtonElement).disabled).toBe(true);
		}
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

describe("el PATCH que falla", () => {
	test("el toast lleva el requestId y el diálogo se queda a la vista", async () => {
		// El comentario de `confirmar()` promete que el diálogo NO se cierra cuando
		// el PATCH falla, "para que un fallo deje la confirmación a la vista con el
		// motivo ya encima". Sin este test la promesa no la sostiene nadie: un
		// `.then(() => setPorConfirmar(null))` sin `.catch` cerraría el diálogo y
		// el operador vería su acción evaporarse sin ninguna pista.
		const calls = stubFetchWithCalls(200, detalle);
		const error = spyOn(toast, "error");
		// El GET carga bien y el PATCH revienta: es el caso que el comentario
		// describe, no un 500 de página entera.
		calls.length = 0;
		globalThis.fetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			calls.push({
				url: String(_input),
				method: init?.method ?? "GET",
				body: typeof init?.body === "string" ? init.body : null,
			});
			if ((init?.method ?? "GET") === "PATCH") {
				return new Response(
					JSON.stringify({
						statusCode: 500,
						message: "Internal server error",
						requestId: "req-abc12345",
					}),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(JSON.stringify(detalle), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Descartado" }));
		const dialogo = await screen.findByRole("alertdialog");
		fireEvent.click(screen.getByRole("button", { name: "Descartado" }));

		// El aviso con el `requestId`: es lo único que permite cruzar el fallo con
		// el log del servidor, y sin él el toast no le da nada a soporte.
		await waitFor(() =>
			expect(error).toHaveBeenCalledWith(
				"Error interno del servidor · req-abc12345",
			),
		);

		// Y el diálogo sigue ahí, con el motivo encima, para que el operador vea
		// que su acción no se guardó y pueda reintentarla sin reescribirla.
		await settle();
		expect(screen.queryByRole("alertdialog")).not.toBeNull();
		expect(dialogo.textContent).toContain("descartado");
		// El pie tampoco pasó a "Descartado": la fila no se movió.
		expect(screen.getByText("Ya está en Abierto")).toBeDefined();
	});

	test("un fallo no deja el pie en un estado que el API nunca confirmó", async () => {
		const error = spyOn(toast, "error");
		globalThis.fetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			if ((init?.method ?? "GET") === "PATCH") {
				return new Response(
					JSON.stringify({
						statusCode: 500,
						message: "Internal server error",
						requestId: "req-abc12345",
					}),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(JSON.stringify(detalle), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		renderDrawer();
		await waitFor(() =>
			expect(screen.getByText("Ya está en Abierto")).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Corregido" }));

		await waitFor(() => expect(error).toHaveBeenCalled());
		// `onSuccess` no corrió, así que el seed del detalle no ocurrió y el pie
		// sigue diciendo la verdad. Si alguien "optimizara" poniendo el estado
		// optimista antes del PATCH, este assert es lo que lo delata.
		await settle();
		expect(screen.getByText("Ya está en Abierto")).toBeDefined();
		expect(screen.queryByText("Ya está en Corregido")).toBeNull();
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
