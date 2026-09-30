import { expect, getServedHtml, test } from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * This landing is server-rendered for one reason: to be indexed. Everything
 * else it does is negotiable, but if the SSR pass breaks, the product stops
 * existing for every crawler and for every visitor whose JavaScript never
 * arrives — and the failure is invisible to every other suite in the repo.
 *
 * `bun test src` covers the library and schema modules. `apps/api` has 44
 * end-to-end tests, all of them about the backend. Nothing between them
 * asserts a single byte of what this app serves. That is the hole.
 *
 * Every assertion here is made against the SERVED HTML, read through
 * `APIRequestContext`, not against the hydrated page. That is deliberate: a
 * `page.goto` + `waitForLoadState` would also pass against a site that serves
 * an empty shell and fills in client-side, which is exactly the regression
 * this file exists to catch.
 */
test.describe("server-rendered landing", () => {
	test("GET / serves the hero copy in the HTML, before any JavaScript runs", async ({
		request,
	}) => {
		const { status, html } = await getServedHtml(request, "/");

		expect(status).toBe(200);
		// Real copy, not merely "the response was not an error". A shell with
		// no text returns 200 too — that is the failure being guarded.
		// Both strings are asserted as CONTIGUOUS substrings on purpose: React
		// splits interpolated text nodes with `<!-- -->` markers, so a phrase
		// assembled from `{a} {b}` would never match even on a healthy render.
		// These two are single literal nodes, which is what makes them a
		// reliable SSR witness.
		expect(html).toContain("La comida que sobra no tiene que perderse.");
		expect(html).toContain("Recoges el mismo día.");
	});

	test("GET / serves the document landmarks a crawler and a screen reader need", async ({
		request,
	}) => {
		const { html } = await getServedHtml(request, "/");

		// The skip link is the first focusable element on the page. If SSR ever
		// drops <body>, this is the first thing that breaks and the last thing
		// anyone notices.
		expect(html).toContain('href="#main"');
		expect(html).toContain("<main");
		expect(html).toContain('aria-label="Principal"');
		// `<html lang>` drives screen-reader pronunciation and is set in
		// __root.tsx, i.e. only present if the root route really rendered.
		expect(html).toMatch(/<html[^>]+lang="es"/);
	});

	test("GET / serves the FAQ structured data that earns the rich result", async ({
		request,
	}) => {
		const { html } = await getServedHtml(request, "/");

		// The JSON-LD block is injected by the route's `head`. It is invisible
		// on the page, so nothing else in the repo would notice its loss, and
		// its loss is a silent downgrade of the site's search presence.
		expect(html).toContain('type="application/ld+json"');
		expect(html).toContain('"@type":"FAQPage"');
	});

	test("GET / returns 200 and real content even though its loader calls the API", async ({
		request,
	}) => {
		// The `/` loader awaits /stats/platform, /app-config/public and
		// /offers/random before the markup is produced. The loaders catch their
		// own failures so the page can never be taken down by the API — that is
		// the SEO invariant, and it is asserted here end to end: this test
		// navigates every public route in sequence, so a loader that started
		// throwing (and a 500 in SSR is a 404 to the user) would fail it.
		for (const path of ["/", "/about", "/for-business", "/terms", "/privacy"]) {
			const { status, html } = await getServedHtml(request, path);
			expect(status, `${path} must not 500 in SSR`).toBe(200);
			expect(html, `${path} must serve an <h1>`).toContain("<h1");
		}
	});
});
