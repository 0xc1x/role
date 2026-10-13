import { expect, getServedHtml, SITE_URL, test } from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * A marketing landing is an SEO surface, and SEO metadata is the one part of a
 * page that no unit test and no visual check ever looks at. The title can
 * regress to the root default, the description can be dropped, the canonical
 * can go relative — and the site keeps rendering perfectly, keeps passing
 * `bun test src`, and quietly stops being indexed.
 *
 * `src/lib/__tests__/seo-files.test.ts` already guards the GENERATED ARTIFACTS
 * (`robots.txt`, `sitemap.xml`). This file guards the PER-RESPONSE metadata,
 * which is a different surface: it is produced by each route's `head()` and
 * only exists in the response the server sends.
 *
 * Every assertion reads the served HTML through `APIRequestContext`, because
 * metadata that is correct only after hydration is metadata a crawler never
 * sees.
 */
const INDEXABLE_ROUTES = [
	{
		path: "/",
		title: "Rolé — rescata comida excedente cerca de ti",
		description:
			"Descubre ofertas de comida excedente de negocios locales, salva comida buena de terminar en la basura y ahorra en tu día a día.",
	},
	{
		path: "/about",
		title: "Sobre Rolé | Marketplace de comida excedente",
		description:
			"Nuestra misión: que la comida excedente llegue a gente que la valora, no al contenedor.",
	},
	{
		path: "/how-it-works",
		title: "Cómo funciona Rolé | App de comida excedente",
		description:
			"Reserva en la app, recoge en el negocio y salva comida: así de simple funciona Rolé.",
	},
	{
		path: "/for-business",
		title: "Rolé para negocios | Vende tu comida excedente",
		description:
			"Recupera ingresos por tu comida excedente, atrae nuevos clientes y reduce tu desperdicio con Rolé.",
	},
	{
		path: "/help-center",
		title: "Centro de ayuda | App de comida excedente",
		description:
			"Respuestas sobre reservas, recogidas, pagos y tu cuenta en Rolé.",
	},
	{
		// Los legales quedan cortos a propósito. Nadie busca "privacidad de Rolé",
		// y meterle un término de búsqueda para competir en una query que no
		// existe solo agrega ruido al snippet.
		path: "/terms",
		title: "Términos | Rolé",
		description: "Términos y condiciones de uso de Rolé.",
	},
	{
		path: "/privacy",
		title: "Privacidad | Rolé",
		description: "Cómo tratamos tus datos personales en Rolé.",
	},
] as const;

/** Google corta el título alrededor de los 60 caracteres. */
const TITLE_BUDGET = 60;

/**
 * Las páginas de intención de búsqueda son las que tienen que decir QUÉ es Rolé.
 *
 * Estas cuatro eran de 10 a 23 caracteres y ninguna nombraba el producto: el
 * posicionamiento entero del marketplace es "comida excedente" y solo el
 * homepage lo decía en su título. `/` ya lo hacía bien y no se toca.
 *
 * El término va en la COLA, después del beneficio. "App de comida excedente |
 * Cómo funciona Rolé" rankea igual y se lee como spam.
 *
 * Y el geo NO va en los títulos, a propósito: vive en el `areaServed` del
 * JSON-LD y en `og:locale`. Atar el copy a un solo mercado cuesta más de lo que
 * aporta mientras la marca es chica; si Rolé crece, se agrega.
 */
test.describe("SEO metadata per route", () => {
	test("ningún título se queda corto ni se pasa del presupuesto", () => {
		// Un título de 10 caracteres no es un título: es el nombre de la página.
		// El piso está en 40 para las de contenido, y 15 para las legales, que
		// son cortas por decisión y no por descuido.
		for (const route of INDEXABLE_ROUTES) {
			const legal = route.path === "/privacy" || route.path === "/terms";
			expect(route.title.length).toBeGreaterThanOrEqual(legal ? 15 : 40);
			expect(route.title.length).toBeLessThanOrEqual(TITLE_BUDGET);
		}
	});

	test("las páginas de intención de búsqueda nombran el producto", () => {
		// La aserción que vuelve esto un cambio de SEO y no una retoqueada de
		// copy: si alguien vuelve a poner "Sobre Rolé", esto falla.
		for (const path of [
			"/about",
			"/how-it-works",
			"/for-business",
			"/help-center",
		]) {
			const route = INDEXABLE_ROUTES.find((r) => r.path === path);
			expect(route?.title.toLowerCase()).toContain("comida excedente");
		}
	});

	for (const route of INDEXABLE_ROUTES) {
		test(`${route.path} serves its own title, description and canonical`, async ({
			request,
		}) => {
			const { status, html } = await getServedHtml(request, route.path);
			expect(status).toBe(200);

			// Exact, not "contains a title": every route inherits the root's
			// `Rolé — Rescata comida deliciosa a precio increíble`, so a missing
			// per-route title still yields a <title> and would pass a softer
			// assertion. Seven pages sharing one title is a real SEO failure.
			expect(html).toContain(`<title>${route.title}</title>`);
			expect(html).toContain(
				`<meta name="description" content="${route.description}"/>`,
			);
			// El canonical tiene que ser ABSOLUTO y tiene que ser EL DE ESTE
			// ENTORNO. Antes la aserción era `/href="https:\/\/[^"]+"/`, que
			// aceptaba cualquier cosa: una suite que anunciaba `https://role.app`
			// desde `127.0.0.1:3101` pasaba igual, y ese es exactamente el defecto
			// —el canonical del dominio equivocado es lo que desindexa un sitio,
			// y no se ve mirando la página que se está probando.
			expect(html).toContain(
				`<link rel="canonical" href="${SITE_URL}${route.path}"/>`,
			);
		});
	}

	test("the root route does not fall back to the site-wide default title", async ({
		request,
	}) => {
		// Isolated because it is the single most likely regression: the root
		// route's `head` spreads `pageHead(...)` over a base that already
		// carries a title, and if that ordering ever flips, `/` silently
		// becomes the generic default and the highest-traffic page is the one
		// that loses its description.
		const { html } = await getServedHtml(request, "/");
		expect(html).toContain(
			"<title>Rolé — rescata comida excedente cerca de ti</title>",
		);
		expect(html).not.toContain(
			"<title>Rolé — Rescata comida deliciosa a precio increíble</title>",
		);
	});

	test("Open Graph tags describe the page that was requested", async ({
		request,
	}) => {
		// og:* is what a link renders as in a chat or a social feed, and it is
		// the metadata most often left pointing at the root defaults.
		const { html } = await getServedHtml(request, "/how-it-works");
		expect(html).toContain(
			'<meta property="og:title" content="Cómo funciona Rolé"/>',
		);
		expect(html).toContain("<meta property=\"og:site_name\" content=\"Rolé\"/>");
	});

	test("the signup funnel is excluded from indexing", async ({ request }) => {
		// The inverse of the checks above, and the reason they can trust a
		// missing tag elsewhere: it proves the app can actually emit `noindex`.
		const { html } = await getServedHtml(request, "/business-signup");
		expect(html).toContain(
			'<meta name="robots" content="noindex, nofollow"/>',
		);
	});

	test("nothing served announces a domain other than this environment's", async ({
		request,
	}) => {
		// El guard de arranque de `env.ts` impide que falte `VITE_SITE_URL`, pero
		// no que el bundle se arme con el valor equivocado. Este test cierra esa
		// distancia en la única dirección que importa: un canonical o un sitemap
		// apuntando a otro dominio deja el sitio entero fuera del índice, y la
		// suite seguía en verde porque ninguna aserción miraba el valor.
		for (const path of INDEXABLE_ROUTES.map((r) => r.path)) {
			const { html } = await getServedHtml(request, path);
			expect(html).not.toContain("https://role.app");
		}
	});

	test("the generated sitemap and robots.txt announce this environment", async ({
		request,
	}) => {
		// `robots.txt` y `sitemap.xml` los genera el plugin `seoFiles` de
		// `vite.config.ts`, con el MISMO normalizador que el canonical. Antes cada
		// módulo tenía el suyo y divergían con un path configurado.
		const sitemap = await (await request.get("/sitemap.xml")).text();
		expect(sitemap).toContain(`<loc>${SITE_URL}/</loc>`);
		expect(sitemap).toContain(`<loc>${SITE_URL}/how-it-works</loc>`);
		expect(sitemap).not.toContain("https://role.app");

		const robots = await (await request.get("/robots.txt")).text();
		expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
	});
});
