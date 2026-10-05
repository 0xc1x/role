import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Announcement } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import {
	type AnnouncementsResult,
	ensureAnnouncements,
	useAnnouncements,
} from "@/lib/use-announcements";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import { AnnouncementBanner } from "../announcement-banner";

// El aviso lo escribe una persona en el panel de admin y esta página corre en un
// NAVEGADOR. Esa diferencia con el móvil —donde el `Text` de React Native no
// interpreta nada— es toda esta spec: el mismo `body`, en el móvil, no puede
// hacer daño, y acá sí.
//
// Por eso el caso central no es "el body aparece" sino "NO HAY ELEMENTO". Un
// `toContain(body)` pasaría igual con `dangerouslySetInnerHTML`, con `marked()`,
// o con un sanitizer roto, y los tres son el mismo agujero. Lo que se afirma es
// la AUSENCIA del elemento, en el DOM que se pintó y en el HTML servido.

const BASE: Announcement = {
	id: "a0000000-0000-4000-8000-0000000000a1",
	title: "Mantenimiento esta noche",
	body: "El servicio vuelve a las 23:00.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};

/** Un aviso con `severity` y `body` cambiados, y el resto igual. */
function aviso(over: Partial<Announcement> = {}): Announcement {
	return { ...BASE, ...over };
}

/**
 * El cuerpo que rompe: `<script>`, una etiqueta de formato, un `img` con
 * `onerror` y un `javascript:`. Los cuatro juntos, porque cada uno falla por su
 * cuenta: `marked()` interpreta los dos últimos y deja el primero como texto.
 */
const CUERPO_HOSTIL =
	'<script>alert(1)</script> y <b>negrita</b> con <img src=x onerror="alert(2)"> y <a href="javascript:alert(3)">enlace</a>';

/**
 * El mismo aviso con `body` y `title` triviales.
 *
 * Sirve para dos cosas, y las dos son comparaciones: el inventario de etiquetas
 * de la banda no puede cambiar por lo que el operador escribió, y el texto que
 * se ve tiene que ser el suyo.
 */
const CUERPO_BENIGNO = "El servicio vuelve a las 23:00.";

/** Las etiquetas que abre la banda, en el orden en que las abre. */
function inventarioDeEtiquetas(html: string): string[] {
	return [...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map(
		(m) => m[1]?.toLowerCase() ?? "",
	);
}

/** Cuántas veces aparece `html`, en orden de aparición, para un diff estable. */
function conteoDeEtiquetas(html: string): Record<string, number> {
	const conteo: Record<string, number> = {};
	for (const tag of inventarioDeEtiquetas(html)) {
		conteo[tag] = (conteo[tag] ?? 0) + 1;
	}
	return conteo;
}

function banda(announcements: readonly Announcement[]): string {
	return renderToStaticMarkup(
		<AnnouncementBanner announcements={announcements} />,
	);
}

/**
 * Lo mismo que `LandingPage` de `routes/index.tsx`, sin el router: el hook con
 * el `delServidor` del loader, el atributo en el `<main>` y la banda adentro.
 *
 * Vive a nivel de archivo y no dentro de un `describe` porque lo usan dos
 * bloques con renderizadores distintos: el del cliente, que monta con `render` y
 * espera, y el de SSR, que va con `renderToStaticMarkup` y no espera nada.
 */
function Main({ delServidor }: { delServidor: AnnouncementsResult }) {
	const avisos = useAnnouncements(delServidor);
	return (
		<main id="main" data-announcements-source={avisos.source}>
			<AnnouncementBanner announcements={avisos.data ?? []} />
			<p>Únete a Rolé hoy mismo</p>
		</main>
	);
}

// Un `cleanup()` por test, a nivel de archivo, y no por `describe`: varias de
// estas aserciones afirman AUSENCIA sobre el documento entero —"no hay ningún
// `<dialog>`", "no hay ninguna región"— y un render del test anterior que quedó
// en el documento las volvería rojas por un motivo que no es del código bajo
// prueba. Con `bun test --isolate` el proceso se renueva por archivo y el
// olvido no se nota; en la suite completa no, y por eso el cleanup es explícito.
afterEach(() => {
	cleanup();
});

describe("el body del operador es TEXTO, no HTML", () => {
	test("lo que escribió el operador se ve literal y no se convierte en elemento", () => {
		render(
			<AnnouncementBanner announcements={[aviso({ body: CUERPO_HOSTIL })]} />,
		);

		// El texto del nodo es EXACTAMENTE lo que escribió el operador, con las
		// etiquetas adentro. Igualdad y no `toContain`: `toContain` pasaría con un
		// cuerpo saneado que se comió el `<script>`, que no es lo que se afirma.
		const cuerpo = screen.getByText(CUERPO_HOSTIL, { exact: true });
		expect(cuerpo.textContent).toBe(CUERPO_HOSTIL);

		// Y la ausencia, que es la garantía real: no hay NINGÚN elemento.
		// `section`, el elemento del componente. La búsqueda se acota a la banda
		// y no a `document`: si el `body` tuviera algo de otro render, la ausencia
		// que se afirma sería de otra cosa.
		const painted = cuerpo.closest("section");
		expect(painted).not.toBeNull();
		expect(painted?.querySelector("script")).toBeNull();
		expect(painted?.querySelector("b")).toBeNull();
		expect(painted?.querySelector("img")).toBeNull();
		expect(painted?.querySelector("a")).toBeNull();
		expect(painted?.innerHTML).not.toContain("<script");
	});

	test("el HTML servido lleva el cuerpo escapado, no el elemento", () => {
		// Esta es la forma que llega al navegador: el SSR es de donde sale el
		// primer render, y un `dangerouslySetInnerHTML` se nota acá antes que en
		// ningún otro lado.
		const html = banda([aviso({ body: CUERPO_HOSTIL })]);

		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("&lt;b&gt;negrita&lt;/b&gt;");
		// El título también es texto: un operador con `<b>` en el título tampoco
		// encuentra un elemento.
		const conTitleHostil = banda([
			aviso({ title: "<b>Urgente</b>", body: "cuerpo" }),
		]);
		expect(conTitleHostil).toContain("&lt;b&gt;Urgente&lt;/b&gt;");

		expect(html).not.toContain("<script");
		expect(html).not.toContain("<b>");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<a ");
		// Y las COMILLAS del operador también van escapadas, que es lo que impide
		// que su `onerror` se vuelva un atributo en vez de texto.
		expect(html).toContain("onerror=&quot;alert(2)&quot;");
		expect(html).not.toContain('onerror="');
	});

	test("un body al máximo del contrato se pinta entero, sin cortar nada", () => {
		// 2000 es el CHECK de la tabla (`char_length between 3 and 2000`). El
		// cuerpo se arma pegando una etiqueta al final a propósito: un truncado
		// hecho sobre markup dejaría una etiqueta abierta, y uno hecho a ciegas
		// cortaría el aviso por la mitad sin avisar.
		const cola = "</b><script>";
		const cuerpoMaximo = `${"a".repeat(2000 - cola.length)}${cola}`;
		expect(cuerpoMaximo.length).toBe(2000);

		render(
			<AnnouncementBanner announcements={[aviso({ body: cuerpoMaximo })]} />,
		);

		const cuerpo = screen.getByText(cuerpoMaximo, { exact: true });
		expect(cuerpo.textContent).toBe(cuerpoMaximo);
		expect(cuerpo.children.length).toBe(0);

		// Acotado a la banda, no a `document`: el cuerpo más largo del contrato
		// tampoco puede haber construido un elemento, y lo que se afirma es sobre
		// lo que este render pintó.
		const painted = cuerpo.closest("section");
		expect(painted?.querySelector("b")).toBeNull();
		expect(painted?.querySelector("script")).toBeNull();
	});

	test("el inventario de etiquetas de la banda no depende de lo que escribió el operador", () => {
		// LA FORMA QUE SOBREVIVE A `<svg onload>`.
		//
		// La forma obvia —`querySelector("svg") === null`— es un falso positivo
		// garantizado: el icono `Megaphone` del propio componente ES un `<svg>`, así
		// que esa aserción solo puede fallar, y cuando falló parece un hallazgo de
		// seguridad en vez de un error del test.
		//
		// Lo que sí discrimina es un DIFF contra un render benigno: si lo que el
		// operador escribió construyera elementos, el inventario cambiaría. Y el
		// `<svg>` legitimo está en los dos lados, así que no interfiere. La lista
		// explícita es la segunda mitad: dice qué elementos son los de la banda,
		// para que un icono nuevo no se cuele sin que alguien lo decida.
		const hostil = banda([
			aviso({ body: CUERPO_HOSTIL, title: "<i>título</i>" }),
		]);
		const benigno = banda([aviso({ body: CUERPO_BENIGNO })]);

		expect(conteoDeEtiquetas(hostil)).toEqual(conteoDeEtiquetas(benigno));
		expect(inventarioDeEtiquetas(benigno)).toEqual([
			"section",
			"div",
			"span",
			"svg",
			"path",
			"path",
			"path",
			"ul",
			"li",
			"p",
			"p",
		]);
	});
});

describe("la banda va en el flujo, y el banner no decide", () => {
	test("no es un overlay: nada de `fixed`, ni de z-index, ni de diálogo", () => {
		render(<AnnouncementBanner announcements={[aviso()]} />);

		const region = screen.getByRole("region", { name: "Avisos de Rolé" });
		// Un `fixed`/`absolute` con `z-[60]` es la forma del banner de cookies, y
		// es exactamente la que taparía el CTA de suscripción. Por eso se mira la
		// clase y no "se ve bien".
		expect(region.className).not.toMatch(/\b(fixed|absolute|sticky)\b/);
		expect(region.className).not.toContain("z-[");

		// Acotado a la banda: un `dialog` o un `<button>` de otro render no
		// convierten ESTA banda en un overlay. `document` entero daría la
		// respuesta más débil de las dos, porque el fuerte es "no hay control
		// dentro de la banda".
		expect(region.querySelector("[role='dialog']")).toBeNull();
		expect(region.querySelector("dialog")).toBeNull();
		expect(region.querySelector("button")).toBeNull();
		expect(region.querySelector("form")).toBeNull();
	});

	test("sin avisos no hay banda: ni una franja en blanco arriba de todo", () => {
		expect(banda([])).toBe("");

		render(<AnnouncementBanner announcements={[]} />);
		expect(screen.queryByRole("region")).toBeNull();
		// El `body` entero acá sí es el alcance correcto: el componente tiene que
		// no haber pintado NADA, y el único render vivo es este.
		expect(document.body.innerHTML).not.toContain("Avisos de Rolé");
	});

	test("un `required` se pinta IDÉNTICO a un `info`", () => {
		// El acknowledgement es del móvil, contra la tabla y su policy. El banner no
		// es su canal, así que no puede tratarlos distinto: un rótulo de
		// "obligatorio" acá sería una promesa que esta página no puede cumplir.
		// Y para el anónimo ni siquiera puede llegar —la policy corta los
		// `required` sin `auth.uid()`—, así que la diferencia ni se vería nunca.
		const info = banda([aviso({ severity: "info" })]);
		const required = banda([aviso({ severity: "required" })]);

		// Byte a byte. Si mañana aparece un badge, un ícono o un texto que cambia
		// con la severidad, los dos markup dejan de ser iguales y esto se pone rojo.
		expect(required).toBe(info);
		expect(info).not.toContain("Obligatorio");
		expect(info).not.toContain("required");
	});

	test("pinta todos los avisos, en el orden en que los mandó la API", () => {
		// El orden es `priority desc, created_at desc` y lo pone la API, que es
		// donde vive la regla de presentación. Reordenar acá sería una segunda
		// copia; quedarse con el primero dejaría avisos publicados que nadie ve.
		const primero = aviso({
			id: "a0000000-0000-4000-8000-0000000000b1",
			title: "Novedad uno",
			priority: 9,
		});
		const segundo = aviso({
			id: "a0000000-0000-4000-8000-0000000000b2",
			title: "Novedad dos",
			priority: 3,
		});

		const html = banda([primero, segundo]);

		expect(html.indexOf("Novedad uno")).toBeLessThan(
			html.indexOf("Novedad dos"),
		);
		expect(banda([segundo, primero])).not.toBe(html);
	});
});

describe("una API caída no se come la página", () => {
	const previousFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = previousFetch;
	});

	function stubFetch(status: number, body: unknown) {
		globalThis.fetch = (async (input: unknown) => {
			if (String(input).includes("/announcements")) {
				return new Response(JSON.stringify(body), {
					status,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("[]", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;
	}

	/**
	 * Lo mismo que `LandingPage` de `routes/index.tsx`, sin el router: el hook
	 * con el `delServidor` del loader y el atributo en el `<main>`.
	 */
	function montar(delServidor: AnnouncementsResult): HTMLElement {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<Main delServidor={delServidor} />
			</QueryClientProvider>,
		);
		return container;
	}

	test("la API responde y el aviso se pinta, con la fuente auditada", async () => {
		stubFetch(200, [aviso()]);

		const container = montar({ data: undefined, source: "failed" });

		await waitFor(() =>
			expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
				"api",
			),
		);
		expect(screen.getByText("Mantenimiento esta noche")).toBeDefined();
	});

	test("un 500 deja la página en pie, sin banda y con el fallo declarado", async () => {
		stubFetch(503, { message: "No se pudieron obtener los anuncios" });

		const container = montar({ data: undefined, source: "failed" });

		// El fallo se DECLARA: sin `failed` en el markup, "no hay avisos" y "la
		// API está caída" serían la misma página y el incidente no se vería.
		await waitFor(() =>
			expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
				"failed",
			),
		);
		expect(screen.queryByRole("region")).toBeNull();
		// Y el resto de la landing sigue en pie: es una página de marketing, y un
		// aviso que falta no puede impedir que alguien se suscriba.
		expect(container.textContent).toContain("Únete a Rolé hoy mismo");
	});

	test("una respuesta fuera del contrato degrada a `failed`, no a lista vacía", async () => {
		// `severity: "urgente"` no está en el enum del SSOT. Con un casteo en vez
		// de zod esto pasaría como `api` y el aviso se pintaría; con validación
		// es un fallo declarado, que es lo que un dato que no coincide merece.
		stubFetch(200, [{ ...BASE, severity: "urgente" }]);

		const container = montar({ data: undefined, source: "failed" });

		await waitFor(() =>
			expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
				"failed",
			),
		);
		expect(screen.queryByRole("region")).toBeNull();
	});

	test("mientras el observer carga, se conserva el aviso del loader, sin parpadeo", async () => {
		// El caso sano: el loader resolvió con avisos y el observer todavía no
		// tiene nada. El aviso del HTML servido no puede desaparecer un frame
		// mientras la propia consulta del navegador responde.
		const servidos = [aviso()];
		let liberar: () => void = () => {};
		globalThis.fetch = (async (input: unknown) => {
			if (String(input).includes("/announcements")) {
				await new Promise<void>((resolve) => {
					liberar = resolve;
				});
			}
			return new Response("[]", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const container = montar({ data: servidos, source: "api" });

		expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
			"api",
		);
		expect(container.textContent).toContain("Mantenimiento esta noche");
		liberar();
	});
});

describe("el source que se PUBLICA es el del loader, no el del observer", () => {
	// ─── POR QUÉ ESTE CASO VIVE AQUÍ Y NO EN EL DE ARRIBA ───────────────────────
	//
	// Los tests de arriba assertan con `waitFor`: corren en el CLIENTE, donde la
	// petición resuelve y el observer termina diciendo la verdad. El HTML que ve
	// un crawler es otro render —el del servidor— y ahí el observer NO tiene
	// tiempo de resolver.
	//
	// `renderToStaticMarkup` es exactamente ese render: no corre effects, así que
	// el observer devuelve su resultado OPTIMISTA, que es lo que sale del server.
	// Por eso estos tests no esperan nada.
	//
	// Lo que se mide acá es el hallazgo de la review: con la query en error, el
	// observer decía `loading` y el atributo publicaba `loading`, mientras la
	// caché decía `error`. La caché sigue diciendo `error`; lo que cambió es de
	// dónde sale el valor publicado.
	const previousFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = previousFetch;
	});

	/** Prende el error en la caché, como lo deja `ensureAnnouncements`. */
	async function cacheConError(): Promise<QueryClient> {
		globalThis.fetch = (async () => {
			throw new Error("sin red");
		}) as unknown as typeof fetch;
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		await ensureAnnouncements(queryClient);
		return queryClient;
	}

	/** Un fetch que no resuelve nunca: el observer queda en su resultado optimista. */
	function fetchColgado() {
		globalThis.fetch = (async () =>
			await new Promise<Response>(() => {})) as unknown as typeof fetch;
	}

	function served(queryClient: QueryClient, delServidor: AnnouncementsResult) {
		return renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<Main delServidor={delServidor} />
			</QueryClientProvider>,
		);
	}

	test("con la API caída el HTML servido declara `failed`, nunca `loading`", async () => {
		const queryClient = await cacheConError();
		fetchColgado();

		const html = served(queryClient, { data: undefined, source: "failed" });

		// Lo que la review midió en el servidor real con un 503.
		expect(html).toContain('data-announcements-source="failed"');
		expect(html).not.toContain('data-announcements-source="loading"');
		// Y la landing entera sigue ahí: esto es un sitio de marketing.
		expect(html).toContain("Únete a Rolé hoy mismo");
		expect(html).not.toContain("Avisos de Rolé");
	});

	test("con la API sana el HTML servido sale del loader y lleva el aviso escapado", async () => {
		// La ruta por la que un CRAWLER recibe el aviso: render de servidor, caché
		// del observer vacía, valor del loader. El atributo tiene que decir `api` y
		// el body del operador tiene que salir como texto.
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		fetchColgado();

		const html = served(queryClient, {
			data: [aviso({ body: CUERPO_HOSTIL })],
			source: "api",
		});

		expect(html).toContain('data-announcements-source="api"');
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).not.toContain("<script>alert");
	});
});

describe("el montaje en la landing", () => {
	// El componente puede estar impecable y no estar montado: en ese caso el
	// aviso no llega a nadie y ningún test de comportamiento se pone rojo. Estos
	// dos leen la ruta y cierran esa puerta —el mismo criterio que
	// `layout.mount.test.ts` en el móvil.
	const ruta = readFileSync(
		new URL("../../routes/index.tsx", import.meta.url),
		"utf8",
	);
	const cuerpoMain = ruta.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
	const cuerpoLoader = ruta.match(/loader:[\s\S]*?\n\thead:/)?.[0] ?? "";

	test("la banda se monta dentro del `<main>`, no aparte", () => {
		expect(cuerpoMain).toContain("<AnnouncementBanner");
		// El banner es lo PRIMERO del main: se lee sin scrollear y no empuja el CTA
		// fuera de la pantalla.
		expect(cuerpoMain.indexOf("<AnnouncementBanner")).toBeLessThan(
			cuerpoMain.indexOf("<Hero"),
		);
	});

	test("el loader resuelve los avisos por la vía que degrada", () => {
		// `ensureAnnouncements` no lanza; un `ensureQueryData(announcements…)`
		// pelado sí, y un 500 de la API de avisos se convertiría en el error de
		// la landing entera.
		expect(cuerpoLoader).toContain("ensureAnnouncements(context.queryClient)");
		expect(cuerpoLoader).toContain("return { announcements }");
		expect(ruta).toContain("data-announcements-source={avisos.source}");
	});

	test("el `source` publicado sale del LOADER, no de un observer recalculado", () => {
		// El hallazgo de la review: `LandingPage` recalculaba el `source` con un
		// `useQuery` propio, así que el render del servidor publicaba siempre
		// `loading` — el resultado optimista de `@tanstack/query-core` pone
		// `pending` siempre que no haya `data`, aunque la caché esté en `error`.
		// Con la API en 503 el HTML servido decía `loading` y el incidente quedaba
		// indistinguible de "la API está lenta".
		//
		// Esta aserción es de cableado, y el comportamiento está en el `describe` de
		// arriba, que renderiza el hook con `renderToStaticMarkup`. Acá se fija que
		// la ruta pase el resultado del loader al hook: sin eso, el hook puede estar
		// perfecto y el valor no llegar al markup.
		expect(ruta).toContain(
			"useAnnouncements(Route.useLoaderData().announcements)",
		);
		expect(ruta).not.toMatch(/useAnnouncements\(\s*\)/);
	});
});
