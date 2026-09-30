import { expect, getServedHtml, test } from "./fixtures";

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
		title: "Sobre Rolé",
		description:
			"Nuestra misión: que la comida excedente llegue a gente que la valora, no al contenedor.",
	},
	{
		path: "/how-it-works",
		title: "Cómo funciona Rolé",
		description:
			"Reserva en la app, recoge en el negocio y salva comida: así de simple funciona Rolé.",
	},
	{
		path: "/for-business",
		title: "Rolé para negocios",
		description:
			"Recupera ingresos por tu comida excedente, atrae nuevos clientes y reduce tu desperdicio con Rolé.",
	},
	{
		path: "/help-center",
		title: "Centro de ayuda | Rolé",
		description:
			"Respuestas sobre reservas, recogidas, pagos y tu cuenta en Rolé.",
	},
	{
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

test.describe("SEO metadata per route", () => {
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
			// Absolute canonical: a relative canonical is a redirect instruction
			// the crawler cannot follow, and the SEO module builds it from
			// `VITE_SITE_URL` with a https://role.app fallback precisely so it is
			// never relative.
			expect(html).toMatch(
				/<link rel="canonical" href="https:\/\/[^"]+"/,
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
});
