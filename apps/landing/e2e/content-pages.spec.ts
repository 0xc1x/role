import { expect, getServedHtml, gotoHydrated, test } from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * A page that throws during SSR is indistinguishable, from the outside, from a
 * page that does not exist: the visitor gets the 404 component and the
 * marketing team gets a 200-shaped silence. On a landing whose only job is to
 * be found, one broken route is a silent hole in the funnel that no log line
 * and no unit test points at.
 *
 * `apps/landing` has 13 unit-test files covering the legal copy and the lib
 * modules. They can prove the copy exists in a module. They cannot prove the
 * route mounts it.
 */
const CONTENT_ROUTES = [
	{ path: "/about", h1: "La comida deliciosa no debería", title: "Sobre Rolé" },
	{ path: "/terms", h1: "Términos y", title: "Términos | Rolé" },
	{ path: "/privacy", h1: "Política de", title: "Privacidad | Rolé" },
	{
		path: "/how-it-works",
		h1: "¿Cómo funciona Rolé?",
		title: "Cómo funciona Rolé",
	},
	{ path: "/help-center", h1: "Centro de ayuda", title: "Centro de ayuda | Rolé" },
	{ path: "/for-business", h1: "Convierte tu excedente en", title: "Rolé para negocios" },
] as const;

test.describe("content routes render server-side", () => {
	for (const route of CONTENT_ROUTES) {
		test(`${route.path} serves 200 with its own heading and title`, async ({
			request,
		}) => {
			const { status, html } = await getServedHtml(request, route.path);

			expect(status).toBe(200);

			// The h1 is what makes it the *same* page and not the 404 fallback,
			// which also renders an <h1> ("Esta oferta se agotó"). Asserting
			// only "<h1" would pass on a 404 and prove nothing.
			expect(html).toContain(route.h1);
			expect(html).not.toContain("Esta oferta se agotó");

			expect(html).toContain(`<title>${route.title}</title>`);
		});
	}

	test("an unknown route serves the 404 copy instead of the marketing hero", async ({
		request,
	}) => {
		// The inverse of the flow above, and the reason the assertion above can
		// trust its h1: it proves the router really does distinguish its routes.
		const { status, html } = await getServedHtml(request, "/no-existe-esta-ruta");

		expect(html).toContain("Esta oferta se agotó");
		expect(html).not.toContain("La comida que sobra no tiene que perderse.");
		// Status is not asserted as 404: TanStack Start serves the not-found
		// component for unmatched client routes with its own status policy, and
		// pinning that here would test the framework rather than the app.
		expect(status).toBeGreaterThanOrEqual(200);
	});
});

test.describe("legal pages resolve their configured values", () => {
	// WHY the assertions are on the substituted copy and the presence of the
	// date badge, and never on a literal date string:
	//
	// The legal copy interpolates `app_config` values, so a broken config path
	// degrades silently — the page still returns 200 and still reads as
	// plausible copy ("pendiente de publicación"), and a published contract ends
	// up naming no operator and no contact address.
	//
	// A literal date like "12 de enero de 2026" is deliberately NOT asserted
	// here. `formatLegalDate` does `new Date("2026-01-12")`, which is UTC
	// midnight, and formats it in the runner's local zone — so the rendered
	// string depends on the machine's `TZ`. A test that hardcodes it would be
	// green on a UTC runner and red in Quito, which is worse than no test. The
	// date is covered as a defect in the report; the pipeline is covered here.
	test("/terms carries the operator identity and contact the API provides", async ({
		page,
	}) => {
		await gotoHydrated(page, "/terms");

		// The badge renders only when `legal.terms_updated_at` is non-empty, so
		// its presence proves the config reached the page.
		await expect(page.getByText("Última actualización:")).toBeVisible();

		// Both are `{controllerIdentity}` / `{contactEmail}` placeholders in
		// `lib/legal/terms-content.ts`. Unsubstituted, the page publishes a
		// contract with no legal entity and no address.
		await expect(
			page.getByText("Rolé Ecuador S.A.", { exact: false }),
		).toBeVisible();
		await expect(
			page.getByText("Contacto legal:", { exact: false }),
		).toBeVisible();
		await expect(
			page.getByText("pendiente de configuración", { exact: false }),
		).toHaveCount(0);
	});

	test("/privacy carries the operator identity and contact the API provides", async ({
		page,
	}) => {
		await gotoHydrated(page, "/privacy");

		await expect(page.getByText("Última actualización:")).toBeVisible();
		await expect(
			page.getByText("es responsable del tratamiento de tus datos", {
				exact: false,
			}),
		).toBeVisible();
		// `/privacy` reads its OWN `privacy.contact_email`, not the legal one.
		// Getting that key wrong leaves a published privacy policy pointing at
		// "pendiente de configuración" — a page that looks finished and answers
		// no data-subject request.
		await expect(
			page.getByText("Contacto de privacidad: privacidad@e2e.example", {
				exact: false,
			}),
		).toBeVisible();
		await expect(
			page.getByText("pendiente de configuración", { exact: false }),
		).toHaveCount(0);
	});
});
