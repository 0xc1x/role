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
 *  - `specific` con `business_ids` YA NO es un caso invisible: al publicar, la API
 *    resuelve cada negocio a su `owner_id` y lo suma a `user_ids`
 *    (`ac74273`). El aviso llega a los dueños, así que no hay nada que avisar
 *    antes de publicar. Lo que queda es un negocio SIN DUEÑO, que el servidor
 *    rechaza con un 400 que lo nombra —y ese error tiene que mostrarse diciendo
 *    cuál negocio, no tragado como un párrafo genérico.
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
		/**
		 * La página del directorio CUANDO el operador está buscando. Sin esto el
		 * stub devuelve lo mismo para cualquier búsqueda, y no se puede probar el
		 * caso real en el que un negocio se eligió buscando y no está en la página
		 * que consulta el form.
		 */
		negociosBuscados?: Array<{ id: string; name: string }>;
		/**
		 * Lo que contesta la escritura cuando el test quiere que FALLE. El 400 del
		 * negocio sin dueño es la razón de existir de esta opción: es un error
		 * real del servidor, y un test que lo pinta necesita que el servidor lo
		 * mande de verdad.
		 */
		escritura?: { status: number; body: unknown };
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
		const json = (data: unknown, status = 200) =>
			new Response(JSON.stringify(data), {
				status,
				headers: { "Content-Type": "application/json" },
			});

		if (method === "POST" || method === "PATCH") {
			const escritura = opciones.escritura;
			return escritura ? json(escritura.body, escritura.status) : json(anuncio);
		}
		if (url.includes("/announcements/admin"))
			return json({ data: opciones.obligatorios ?? [], meta });
		if (url.includes("/profiles"))
			return json({ data: opciones.consumidoras ?? [], meta: META });
		if (url.includes("/businesses"))
			return json({
				data: url.includes("search=")
					? (opciones.negociosBuscados ?? opciones.negocios ?? [])
					: (opciones.negocios ?? []),
				meta: META,
			});
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

	/*
	 * LA CASILLA QUE SE RETIRÓ, Y EL TEST QUE LA MUERDE.
	 *
	 * Con la resolución de dueños en el servidor (`ac74273`), un `specific` con
	 * solo negocios SÍ llega: cada negocio se resuelve a su `owner_id` y se suma a
	 * `user_ids`. La advertencia que decía que no lo iban a ver era una falsedad,
	 * y la casilla que había que marcar para publicar era además un gate que
	 * frenaba publicaciones correctas.
	 *
	 * Este test afirma las DOS mitades: no aparece el aviso retirado, no hay
	 * casilla de confirmación, y el aviso se publica. Si alguien vuelve a poner
	 * la casilla, este test cae por la casilla y por el POST que no sale.
	 */
	test("en el alta, elegir solo negocios publica sin pedir ninguna confirmación", async () => {
		const calls = stubApi({
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }],
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);

		noAparece("Los negocios que elegiste no lo van a ver");
		// Elegir negocios no abre NINGÚN aviso: ya hay a quién llegar, y lo que
		// puede salir mal —un negocio sin dueño— es un error del servidor, no algo
		// que se pueda avisar antes de intentarlo.
		await waitFor(() => noAparece("Este aviso no tiene a quién llegar"));
		// El único checkbox de la pantalla es el del `IdPicker` con el negocio
		// elegido. La cantidad, y no el texto, es lo que afirma que no hay una
		// casilla de confirmación: si alguien la vuelve a poner —con el copy que
		// sea— acá aparece una de más y esto cae.
		expect(screen.getAllByRole("checkbox")).toHaveLength(1);

		submit();
		await waitFor(() => expect(posts(calls)).toHaveLength(1));
		expect(posts(calls)[0]?.body).toMatchObject({
			audience_kind: "specific",
			business_ids: [NEGOCIO_ID],
		});
		// `user_ids: []` también se omite: una lista vacía explícita en el alta es
		// indistinguible de la que pidió el operador. Los dueños los suma el
		// servidor, no el panel.
		expect(posts(calls)[0]?.body).not.toHaveProperty("user_ids");
	});

	// EL CASO QUE QUEDÓ REAL Y QUE NO ES EL DE LA ADVERTENCIA RETIRADA: un
	// negocio sin dueño. La API lo rechaza con un 400 que lo nombra, y el panel
	// tiene que decirlo acá, junto a la lista de negocios: el nombre cuando el
	// directorio lo conoce y el id siempre — sin el nombre es menos accionable,
	// pero nunca deja al operador sin saber a quién hay que darle dueño. Un
	// párrafo de error genérico arriba del form no dice ninguna de las dos cosas.
	//
	// Con la resolución, un aviso dirigido a negocios que se publica es un aviso
	// que llega: no puede haber un "se publicó y no lo ve nadie", y por eso este
	// error es el ÚNICO lugar donde el panel puede dar la razón exacta.
	test("un negocio sin dueño vuelve como un error que nombra el negocio", async () => {
		const otroNegocio = {
			id: "66666666-6666-4666-8666-666666666666",
			name: "Bodega La Esquina",
		};
		const calls = stubApi({
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }, otroNegocio],
			escritura: {
				status: 400,
				body: {
					statusCode: 400,
					error: "Bad Request",
					message: `No se puede publicar: estos negocios no tienen dueño asignado y el aviso no llegaría a nadie: ${NEGOCIO_ID}`,
					requestId: "req-sin-dueno-1",
				},
			},
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);

		// El POST salió: la confirmación que se retiró ya no frena la publicación.
		submit();
		await waitFor(() => expect(posts(calls)).toHaveLength(1));

		// Lo accionable: el nombre del negocio que el servidor culpó, junto a su id.
		expect(
			await screen.findByText(`Panadería Sur · ${NEGOCIO_ID}`),
		).toBeDefined();
		expect(texto()).toContain("hay negocios sin dueño asignado");
		// Y qué hacer con eso, que es la mitad de "accionable".
		expect(texto()).toContain("Asignale un dueño a cada uno en su ficha");
		// El negocio que NO está en el 400 no se acusa: nombrar al que sí tiene
		// dueño sería darle un motivo falso.
		noAparece("Bodega La Esquina · ");
		// El mensaje del servidor no se traga: sigue arriba, con su requestId, que
		// es lo único que lo correlaciona con el log `announcements_business_*`.
		expect(texto()).toContain("no tienen dueño asignado");
		expect(texto()).toContain("req-sin-dueno-1");
	});

	// El nombre sale del directorio, no del mensaje del servidor: la API nombra
	// ids porque `business_ownership` no tiene el nombre del negocio. Cuando el
	// directorio no conoce el id —porque el operador lo encontró buscando y no
	// está en la página sin búsqueda, o porque el negocio está inactivo— el id se
	// muestra solo: es menos cómodo, pero nunca deja al operador sin saber a quién
	// hay que darle dueño.
	test("si el directorio no conoce el negocio, el error lo nombra con el id", async () => {
		const kiosco = {
			id: "77777777-7777-4777-8777-777777777777",
			name: "Kiosco Cerrado",
		};
		const calls = stubApi({
			// La página sin búsqueda —la que consulta el form— viene vacía, y el
			// kiosco aparece solo cuando el operador lo busca. Es exactamente como
			// pasa en la app, y es el caso real del fallback.
			negocios: [],
			negociosBuscados: [kiosco],
			escritura: {
				status: 400,
				body: {
					statusCode: 400,
					error: "Bad Request",
					message: `No se puede publicar: estos negocios no tienen dueño asignado y el aviso no llegaría a nadie: ${kiosco.id}`,
				},
			},
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.change(screen.getByLabelText("Buscar negocios"), {
			target: { value: "kiosco" },
		});
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Kiosco Cerrado" }),
		);
		submit();
		await waitFor(() => expect(posts(calls)).toHaveLength(1));

		// El id a secas, sin inventar un nombre que el panel no tiene: el mensaje
		// del servidor ya lo nombró y con eso se puede ir a buscar el negocio.
		expect(await screen.findByText(kiosco.id)).toBeDefined();
		noAparece(`Kiosco Cerrado · ${kiosco.id}`);
	});

	/*
	 * EL CASO QUE HACÍA MENTIR AL PANEL, ahora en su versión correcta.
	 *
	 * El service hace MERGE de la audiencia, no reemplazo:
	 * `body.user_ids ?? existing.user_ids` (`announcements.service.ts`). Elegir
	 * negocios encima de una fila que ya tenía consumidoras NO las borra, y el
	 * mapper solo escribe la lista que viene definida. Publicás un `specific` para
	 * Ana, días después abrís el aviso para corregir una errata y elegís dos
	 * negocios: lo que hay que avisar es que a Ana no se la toca, no que "nadie lo
	 * va a ver".
	 *
	 * Y lo que el panel NO puede mostrar es la lista guardada, así que el aviso que
	 * corresponde es el de la audiencia oculta. El que decía que de los negocios
	 * no lee nadie se retiró con la casilla.
	 */
	test("al editar, elegir negocios avisa que la audiencia guardada no se puede mostrar", async () => {
		stubApi({ negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }] });
		// La fila viene con `specific`: el panel no puede mostrar su audiencia
		// (no viene en la lectura), así que a los ojos del test no tiene personas.
		renderForm({ ...anuncio, audience_kind: "specific" });

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);

		expect(
			await screen.findByText("La audiencia de este aviso no se puede mostrar"),
		).toBeDefined();
		// Lo que se afirma es que las personas guardadas SIGUEN, nunca que no lo ve
		// nadie: eso era falso en el caso más común.
		expect(texto()).toContain("se AGREGAN a la lista guardada");
		expect(texto()).not.toContain("se reemplazan");
		noAparece("Los negocios que elegiste no lo van a ver");
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
		submit();

		await waitFor(() => expect(patches(calls)).toHaveLength(1));
		expect(patches(calls)[0]?.body).toMatchObject({
			audience_kind: "specific",
			business_ids: [NEGOCIO_ID],
		});
		// El punto del test: al omitir la lista, el `??` del service cae a la
		// guardada y las personas que ya lo recibían lo siguen recibiendo. Y sale
		// sin tocar ninguna casilla: la que se retiró frenaba esto.
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

/** Los `role="alert"` que hay DENTRO del form, que es lo que este describe. */
function alertsDelForm(): Element[] {
	const form = document.getElementById("announcement-form");
	return form ? Array.from(form.querySelectorAll('[role="alert"]')) : [];
}

/**
 * Los avisos que quedan son los dos que informan y no cambian lo que el operador
 * publica, así que son `status`. NO hay ningún `role="alert"` mientras compone: el
 * único que lo era era el de los negocios que no llegaban, que además frenaba la
 * publicación con una casilla, y con la resolución de dueños ese caso no existe.
 *
 * Interrumpir la lectura de pantalla con un aviso que no cambia nada solo lo
 * habitúa a ignorar los que sí lo cambian.
 */
describe("la asertividad de los avisos del formulario", () => {
	test("los dos avisos que quedan son status y no hay ninguno alert", async () => {
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

		// Elegir negocios ya no abre ningún aviso —no hay nada que avisar— y, sobre
		// todo, no deja nada asertivo: el único `alert` del form es el error del
		// servidor cuando ocurre. El aviso de "sin destino" se va con el primer
		// negocio, porque el aviso ya tiene a quién llegar.
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);
		await waitFor(() => noAparece("Este aviso no tiene a quién llegar"));
		expect(alertsDelForm()).toHaveLength(0);
		expect(calls.every((c) => c.method === "GET")).toBe(true);
	});

	// La asertividad no se perdió con la casilla: se mudó al primitivo que ya la
	// tenía. El 400 del negocio sin dueño interrumpa, porque el operador acaba de
	// publicar y lo que necesita es enterarse YA.
	test("el 400 del negocio sin dueño es alert: es un fallo, no un aviso", async () => {
		stubApi({
			negocios: [{ id: NEGOCIO_ID, name: "Panadería Sur" }],
			escritura: {
				status: 400,
				body: {
					statusCode: 400,
					error: "Bad Request",
					message: `No se puede publicar: estos negocios no tienen dueño asignado y el aviso no llegaría a nadie: ${NEGOCIO_ID}`,
				},
			},
		});
		renderForm();
		completar();

		await elegir("Audiencia", "Personas específicas");
		fireEvent.click(
			await screen.findByRole("checkbox", { name: "Panadería Sur" }),
		);
		submit();

		await screen.findByText(`Panadería Sur · ${NEGOCIO_ID}`);
		expect(alertsDelForm()).toHaveLength(1);
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
