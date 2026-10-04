import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Announcement } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { useAnnouncements } from "@/lib/use-announcements";
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
 * cuenta: `marked()` interprets los dos últimos y no el primero.
 */
const CUERPO_HOSTIL =
	'<script>alert(1)</script> y <b>negrita</b> con <img src=x onerror="alert(2)"> y <a href="javascript:alert(3)">enlace</a>';

function banda(announcements: readonly Announcement[]): string {
	return renderToStaticMarkup(
		<AnnouncementBanner announcements={announcements} />,
	);
}

// Un `cleanup()` por test, a nivel de archivo, y no por `describe`: varias de
// estas aserciones affirmedan AUSENCIA sobre `document` entero —"no hay ningún
// `<dialog>`", "no hay ninguna región"— y un render del test anterior que quedó
// en el documento las volvería rojas por un motivo que no es del código bajo
// prueba. Con `bun test --isolate` el proceso se renueva por archivo y el
// forgets; en la suite completa no, y por eso el cleanup es explícito.
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
		const painted = cuerpo.closest("[role='region']") ?? document.body;
		expect(painted.querySelector("script")).toBeNull();
		expect(painted.querySelector("b")).toBeNull();
		expect(painted.querySelector("img")).toBeNull();
		expect(painted.querySelector("a")).toBeNull();
		expect(painted.innerHTML).not.toContain("<script");
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
		expect(document.querySelector("b")).toBeNull();
		expect(document.querySelector("script")).toBeNull();
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

		expect(document.querySelector("[role='dialog']")).toBeNull();
		expect(document.querySelector("dialog")).toBeNull();
		expect(document.querySelector("button")).toBeNull();
		expect(document.querySelector("form")).toBeNull();
	});

	test("sin avisos no hay banda: ni una franja en blanco arriba de todo", () => {
		expect(banda([])).toBe("");

		render(<AnnouncementBanner announcements={[]} />);
		expect(screen.queryByRole("region")).toBeNull();
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

	/** Lo mismo que `LandingPage` de `routes/index.tsx`, sin el router. */
	function Main() {
		const avisos = useAnnouncements();
		return (
			<main id="main" data-announcements-source={avisos.source}>
				<AnnouncementBanner announcements={avisos.data ?? []} />
				<p>Únete a Rolé hoy mismo</p>
			</main>
		);
	}

	function montar(): HTMLElement {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<Main />
			</QueryClientProvider>,
		);
		return container;
	}

	test("la API responde y el aviso se pinta, con la fuente auditada", async () => {
		stubFetch(200, [aviso()]);

		const container = montar();

		await waitFor(() =>
			expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
				"api",
			),
		);
		expect(screen.getByText("Mantenimiento esta noche")).toBeDefined();
	});

	test("un 500 deja la página en pie, sin banda y con el fallo declarado", async () => {
		stubFetch(503, { message: "No se pudieron obtener los anuncios" });

		const container = montar();

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

		const container = montar();

		await waitFor(() =>
			expect(container.querySelector("main")?.dataset.announcementsSource).toBe(
				"failed",
			),
		);
		expect(screen.queryByRole("region")).toBeNull();
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
		expect(ruta).toContain("data-announcements-source={avisos.source}");
	});
});
