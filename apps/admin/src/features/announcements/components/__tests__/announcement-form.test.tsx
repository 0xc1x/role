import { afterEach, describe, expect, test } from "bun:test";
import type { AnnouncementDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { AnnouncementForm } from "../../forms/announcement-form";

/**
 * El panel es el ÚNICO lugar donde un aviso puede salir invisible sin que nadie
 * se entere, y esta es la forma exacta:
 *
 *  - `audience_kind = 'specific'` con las dos listas vacías lo frena la API (400,
 *    `SPECIFIC_WITHOUT_TARGET`). Que lo frene el servidor NO alcanza: el operador
 *    igual pierde el trabajo si no ve por qué.
 *  - `specific` con SOLO `business_ids` pasa el filtro de la API y no lo ve
 *    NADIE: la policy de select solo mira `user_ids @> array[auth.uid()]`. La
 *    migración sellada lo dice textualmente y difiere la salida a propósito
 *    (rechazar con 400, o resolver negocios → `user_ids`), así que acá no se
 *    decide nada: se hace visible la consecuencia.
 *  - publicar un `required` encima de otro `required` activo apila modales
 *    obligatorios (D10). Es el costo asumido de esa decisión y lo tiene que ver
 *    quien publica, no solo el que lee.
 *
 * El panel además NO puede mostrar a quién le llega un `specific` ya publicado:
 * `user_ids`/`business_ids` están fuera del read path a propósito (la misma fila
 * la leen muchísimos dispositivos). Por eso una lista vacía en el formulario de
 * edición significa "no opino", y el PATCH no puede mandarla.
 */

const ANUNCIO_ID = "11111111-1111-4111-8111-111111111111";
const OBLIGATORIO_ID = "22222222-2222-4222-8222-222222222222";
const CONSUMIDORA_ID = "33333333-3333-4333-8333-333333333333";
const NEGOCIO_ID = "44444444-4444-4444-8444-444444444444";

const anuncio: AnnouncementDto = {
	id: ANUNCIO_ID,
	title: "Mantenimiento del sábado",
	body: "No hay ofertas nuevas entre las 3 y las 5 de la tarde.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T10:00:00.000Z",
	updated_at: "2026-10-01T10:00:00.000Z",
};

const obligatorioActivo: AnnouncementDto = {
	...anuncio,
	id: OBLIGATORIO_ID,
	title: "Actualizá la app antes del domingo",
	body: "La versión anterior deja de funcionar el lunes.",
	severity: "required",
};

/** El segundo obligatorio, para probar que al editar uno el otro sí cuenta. */
const otroObligatorio: AnnouncementDto = {
	...anuncio,
	id: "55555555-5555-4555-8555-555555555555",
	title: "Leé los términos nuevos",
	body: "Rige desde el lunes.",
	severity: "required",
};

interface Recorded {
	method: string;
	url: string;
	body: Record<string, unknown> | undefined;
}

const META = { page: 1, limit: 100, total: 0, total_pages: 0 };

/**
 * Un solo stub para las cuatro superficies que el form toca: el listado de
 * avisos (que además es la fuente del aviso de `required` apilado), el
 * directorio de consumidoras, el de negocios y las escrituras.
 *
 * Las filas del directorio van sin tipar a propósito: viajan dentro de un
 * `Response` que el cliente no valida, y escribirlas como `BusinessDto` obligaría
 * a inventar veinte campos que el panel no mira.
 */
function stubApi(
	opciones: {
		obligatorios?: AnnouncementDto[];
		consumidoras?: Array<{
			id: string;
			full_name: string | null;
			email: string;
		}>;
		negocios?: Array<{ id: string; name: string }>;
	} = {},
) {
	const calls: Recorded[] = [];
	const meta = { ...META, total: (opciones.obligatorios ?? []).length };

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		calls.push({
			method,
			url,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		const json = (data: unknown) =>
			new Response(JSON.stringify(data), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});

		if (method === "POST" || method === "PATCH") return json(anuncio);
		if (url.includes("/announcements/admin"))
			return json({ data: opciones.obligatorios ?? [], meta });
		if (url.includes("/profiles"))
			return json({ data: opciones.consumidoras ?? [], meta: META });
		if (url.includes("/businesses"))
			return json({ data: opciones.negocios ?? [], meta: META });
		return json({ data: [], meta: META });
	}) as unknown as typeof fetch;

	return calls;
}

const previousFetch = globalThis.fetch;

/** El botón real vive en el footer del drawer; acá se reproduce con uno externo. */
function renderForm(announcement?: AnnouncementDto) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<AnnouncementForm
				formId="announcement-form"
				{...(announcement ? { announcement } : {})}
			/>
			<button type="submit" form="announcement-form">
				Publicar
			</button>
		</QueryClientProvider>,
	);
}

function submit() {
	fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
}

/** Texto de todo el form, para afirmaciones sobre párrafos que no son únicos. */
const texto = () => document.body.textContent ?? "";

/**
 * Las ausencias se miden con `queryAllByText(...)` + `toHaveLength(0)`: la
 * longitud del arreglo obliga a que la ausencia sea exacta y no "algún elemento
 * que matchea".
 */
const noAparece = (texto: string) =>
	expect(screen.queryAllByText(texto)).toHaveLength(0);

const posts = (calls: Recorded[]) => calls.filter((c) => c.method === "POST");
const patches = (calls: Recorded[]) =>
	calls.filter((c) => c.method === "PATCH");

/**
 * Abre un `Select` de Base UI y elige una opción por su etiqueta.
 *
 * La secuencia `pointerdown` + `pointerup` + `click` NO es redundante: Base UI
 * escucha eventos de puntero en los items del popup, y un `fireEvent.click` a
 * secas abre el selector pero no elige nada. Es lo mismo que hace
 * `hide-review-dialog.test.tsx`.
 */
async function elegir(nombre: string, etiqueta: string) {
	fireEvent.click(await screen.findByRole("combobox", { name: nombre }));
	const opcion = await screen.findByRole("option", { name: etiqueta });
	fireEvent.pointerDown(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.pointerUp(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.click(opcion);
}

/** Los dos campos que el contrato exige siempre, para llegar a `onSubmit`. */
function completar() {
	fireEvent.change(screen.getByLabelText("Título"), {
		target: { value: "Mantenimiento del sábado" },
	});
	fireEvent.change(screen.getByLabelText("Cuerpo"), {
		target: { value: "No hay ofertas nuevas entre las 3 y las 5." },
	});
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("el contrato manda antes que el servidor", () => {
	test("con el título vacío no publica ni pide nada a la API", async () => {
		const calls = stubApi();
		renderForm();

		fireEvent.change(screen.getByLabelText("Cuerpo"), {
			target: { value: "No hay ofertas nuevas" },
		});
		submit();

		await waitFor(() =>
			expect(
				screen.getByText("El título debe tener al menos 3 caracteres"),
			).toBeDefined(),
		);
		expect(posts(calls)).toHaveLength(0);
	});
});

describe("la audiencia dirigida avisa antes de que salga un aviso sin destino", () => {
	test("un aviso específico sin ninguna lista dice que no tiene a quién llegar", async () => {
		stubApi();
		renderForm();

		await elegir("Audiencia", "Personas específicas");

		expect(
			await screen.findByText("Este aviso no tiene a quién llegar"),
		).toBeDefined();
		expect(texto()).toContain(
			"El servidor rechaza la publicación con las dos listas vacías",
		);
	});

	// El caso que la API NO frena: pasa el filtro y de los negocios elegidos no
	// lee nadie. En el ALTA la fila es nueva, así que el aviso efectivamente no lo
	// ve nadie —y el texto puede decirlo sin mentir—.
	test("en el alta, elegir solo negocios avisa que el aviso no llega y frena la publicación", async () => {
		const calls = stubApi({
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }],
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);

		expect(
			await screen.findByText("Los negocios que elegiste no lo van a ver"),
		).toBeDefined();
		expect(texto()).toContain(
			"sin mostrarse en ninguna app: es una limitación conocida y sin resolver",
		);

		submit();
		await waitFor(() =>
			expect(texto()).toContain("Confirmá que sabés a quién no le va a llegar"),
		);
		expect(posts(calls)).toHaveLength(0);

		// Minor 7: marcar la casilla borra el error ahí mismo. Antes solo se
		// limpiaba cuando cambiaba la audiencia o en el submit siguiente, y
		// quedaba un `FieldError` rojo al lado de una casilla ya marcada.
		fireEvent.click(
			screen.getByRole("checkbox", {
				name: /Entiendo que los negocios de esta lista no van a ver este aviso/,
			}),
		);
		await waitFor(() =>
			expect(texto()).not.toContain(
				"Confirmá que sabés a quién no le va a llegar",
			),
		);
		submit();

		await waitFor(() => expect(posts(calls)).toHaveLength(1));
		expect(posts(calls)[0]?.body).toMatchObject({
			audience_kind: "specific",
			business_ids: [NEGOCIO_ID],
		});
		// `user_ids: []` también se omite: una lista vacía explícita en el alta es
		// indistinguible de la que pidió el operador.
		expect(posts(calls)[0]?.body).not.toHaveProperty("user_ids");
	});

	/*
	 * EL CASO QUE HACÍA MENTIR AL PANEL.
	 *
	 * El service hace MERGE de la audiencia, no reemplazo:
	 * `body.user_ids ?? existing.user_ids` (`announcements.service.ts`). Elegir
	 * negocios encima de una fila que ya tenía consumidoras NO las borra, y el
	 * mapper solo escribe la lista que viene definida. Publicás un `specific` para
	 * Ana, días después abrís el aviso para corregir una errata y elegís dos
	 * negocios creyendo que agregás audiencia: el aviso tenía que decir que Ana
	 * lo sigue recibiendo, no que "nadie va a ver este aviso".
	 *
	 * Y el payload es lo que hace que eso sea cierto: al no viajar `user_ids`, la
	 * lista guardada sobrevive. Si este test pasara con `user_ids: []` en el
	 * body, el aviso de arriba sería la mitad de la historia.
	 */
	test("al editar, elegir negocios dice que las personas guardadas lo siguen recibiendo", async () => {
		stubApi({ negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }] });
		// La fila viene con `specific`: el panel no puede mostrar su audiencia
		// (no viene en la lectura), así que a los ojos del test no tiene personas.
		renderForm({ ...anuncio, audience_kind: "specific" });

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);

		expect(
			await screen.findByText("Los negocios que elegiste no lo van a ver"),
		).toBeDefined();
		expect(texto()).toContain("SEGUEN RECIBIÉNDOLO");
		// Y NO dice que no lo ve nadie, que es lo que mentía.
		noAparece("Nadie va a ver este aviso");
		expect(texto()).toContain("no la borra al guardar");
	});

	test("al editar con negocios, el PATCH no manda user_ids: la lista guardada sobrevive", async () => {
		const calls = stubApi({
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }],
		});
		renderForm({ ...anuncio, audience_kind: "specific" });

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);
		fireEvent.click(
			await screen.findByRole("checkbox", {
				name: /Entiendo que los negocios que agregué no lo van a ver/,
			}),
		);
		submit();

		await waitFor(() => expect(patches(calls)).toHaveLength(1));
		expect(patches(calls)[0]?.body).toMatchObject({
			audience_kind: "specific",
			business_ids: [NEGOCIO_ID],
		});
		// El punto del test: al omitir la lista, el `??` del service cae a la
		// guardada y las personas que ya lo recibían lo siguen recibiendo.
		expect(patches(calls)[0]?.body).not.toHaveProperty("user_ids");
	});

	test("con una consumidora elegida no avisa que los negocios no lo van a ver", async () => {
		const calls = stubApi({
			consumidoras: [
				{ id: CONSUMIDORA_ID, full_name: "Ana", email: "ana@correo.ec" },
			],
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Ana · ana@correo.ec" }),
		);

		await waitFor(() => noAparece("Los negocios que elegiste no lo van a ver"));
		submit();

		await waitFor(() => expect(posts(calls)).toHaveLength(1));
		expect(posts(calls)[0]?.body).toMatchObject({ user_ids: [CONSUMIDORA_ID] });
	});

	// La fila publicada NO trae la audiencia, así que el panel no puede decir qué
	// tiene guardado. Mandar `[]` sería borrar el destinatario de un aviso que
	// alguien puede estar leyendo: el PATCH omite las listas vacías. Y la palabra
	// es "conserva", no "reemplaza": el service hace merge.
	test("editar un aviso específico sin elegir a nadie conserva su audiencia", async () => {
		const calls = stubApi();
		renderForm({ ...anuncio, audience_kind: "specific" });

		expect(
			await screen.findByText("La audiencia de este aviso no se puede mostrar"),
		).toBeDefined();
		// "AGREGAN", no "reemplazan": el service hace merge
		// (`body.user_ids ?? existing.user_ids`) y el mapper solo escribe la lista
		// que viene. Decir "reemplaza" haría creer al operador que elegir a alguien
		// borra a los demás, que es el otro sentido del mismo mentira.
		expect(texto()).toContain("se AGREGAN a la lista guardada");
		expect(texto()).not.toContain("se reemplazan");
		submit();

		await waitFor(() => expect(patches(calls)).toHaveLength(1));
		expect(patches(calls)[0]?.body).not.toHaveProperty("user_ids");
		expect(patches(calls)[0]?.body).not.toHaveProperty("business_ids");
	});

	// Las listas son el camino de la audiencia DIRIGIDA. Un aviso para todo el
	// mundo que arrastra una lista de personas guardaría datos que la policy
	// nunca mira —y que el panel no puede ni mostrar después—.
	test("al volver a una audiencia que no es dirigida, la lista no viaja", async () => {
		const calls = stubApi({
			consumidoras: [
				{ id: CONSUMIDORA_ID, full_name: "Ana", email: "ana@correo.ec" },
			],
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Ana · ana@correo.ec" }),
		);
		await elegir("Audiencia", "Todo el mundo");

		submit();
		await waitFor(() => expect(posts(calls)).toHaveLength(1));
		expect(posts(calls)[0]?.body).not.toHaveProperty("user_ids");
	});
});

/** El `role` del recuadro que contiene un aviso, por su título. */
async function rolDelAviso(titulo: string): Promise<string | null> {
	const encontrado = await screen.findByText(titulo);
	return encontrado.parentElement?.getAttribute("role") ?? null;
}

// Minor 5: solo la audiencia que no llega interrumpe (asertivo). Las otras dos
// son `status`. Si las tres volvieran a `alert`, el operador se habitúa a ignorar
// los avisos del drawer —y el único que decide qué hace se pierde con ellos.
describe("la asertividad de los tres avisos", () => {
	test("el de negocios es alert; los otros dos son status", async () => {
		const calls = stubApi({
			obligatorios: [obligatorioActivo],
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }],
		});
		renderForm();
		completar();

		// `required` con otro activo: este aviso NO cambia lo que el operador
		// publica, así que no interrumpe.
		await elegir("Severidad", "Obligatorio");
		expect(await rolDelAviso("Este aviso se apila con otro obligatorio")).toBe(
			"status",
		);

		// Sin audiencia: informa, no interrumpe.
		await elegir("Audiencia", "Personas específicas");
		expect(await rolDelAviso("Este aviso no tiene a quién llegar")).toBe(
			"status",
		);

		// Con negocios: frena la publicación, y por eso interrumpe.
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);
		expect(await rolDelAviso("Los negocios que elegiste no lo van a ver")).toBe(
			"alert",
		);
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});
});

describe("el aviso de `required` apilado (D10)", () => {
	// POR QUÉ NINGUNO DE ESTOS ESPERA POR LA REQUEST: el conteo sale de un
	// listado, y esperar a que la request SALIERA no dice que la respuesta llegó.
	// Un test de ausencia que no espera al dato pasa aunque la condición esté
	// rota, porque todavía no hay nada en pantalla. La espera es el propio texto
	// del aviso, que lleva la cuenta: si aparece, el listado resolvió.
	test("publicar un obligatorio con otro activo avisa que se apilan, y publica", async () => {
		const calls = stubApi({ obligatorios: [obligatorioActivo] });
		renderForm();
		completar();

		await elegir("Severidad", "Obligatorio");

		expect(
			await screen.findByText("Este aviso se apila con otro obligatorio"),
		).toBeDefined();
		expect(texto()).toContain("Hay 1 aviso obligatorio activo");

		// Avisa y NO impide: la unicidad del `required` no está decidida y el panel
		// no la decide por su cuenta.
		submit();
		await waitFor(() => expect(posts(calls)).toHaveLength(1));
		expect(posts(calls)[0]?.body).toMatchObject({ severity: "required" });
	});

	test("un aviso informativo no avisa nada aunque haya un obligatorio activo", async () => {
		stubApi({ obligatorios: [obligatorioActivo] });
		renderForm();

		// Primero se ve el aviso —que es lo que confirma que el listado resolvió— y
		// después se baja a informativo: el aviso tiene que desaparecer.
		await elegir("Severidad", "Obligatorio");
		await screen.findByText("Este aviso se apila con otro obligatorio");

		await elegir("Severidad", "Informativo");

		noAparece("Este aviso se apila con otro obligatorio");
	});

	// El aviso se cuenta a sí mismo en el total del servidor: con dos
	// obligatorios y editando uno, lo que se apila es el otro.
	test("editar un obligatorio cuenta los otros y no se cuenta a sí mismo", async () => {
		stubApi({ obligatorios: [obligatorioActivo, otroObligatorio] });
		renderForm(obligatorioActivo);

		expect(
			await screen.findByText("Este aviso se apila con otro obligatorio"),
		).toBeDefined();
		// El número es la prueba de que la cuenta es la correcta: si el aviso se
		// contara a sí mismo, diría "Hay 2".
		await waitFor(() =>
			expect(texto()).toContain("Hay 1 aviso obligatorio activo"),
		);
		expect(texto()).not.toContain("Hay 2 avisos obligatorios activos");
	});

	// Desactivar el aviso lo saca de la fila: no llega a ninguna pantalla, así que
	// no apila.
	test("un aviso desactivado no avisa que se apila, aunque sea obligatorio", async () => {
		stubApi({ obligatorios: [obligatorioActivo] });
		renderForm(anuncio);

		await elegir("Severidad", "Obligatorio");
		await screen.findByText("Este aviso se apila con otro obligatorio");

		fireEvent.click(screen.getByRole("switch", { name: "Activo" }));

		noAparece("Este aviso se apila con otro obligatorio");
	});
});
