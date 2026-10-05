import {
	ANNOUNCEMENTS_DEFAULT_MODE,
	expect,
	getServedHtml,
	setAnnouncementsMode,
	test,
} from "./fixtures";

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

/**
 * ─── The operator's announcement, as the SERVER sends it ────────────────────
 *
 * The operator types the announcement's `title` and `body` into a form. On the
 * phone that string is inert by construction — React Native's `Text` interprets
 * nothing. This landing is a browser, where `<script>` pasted into a `body` runs.
 * So the question is not "does the copy show up" but "what did the server send",
 * and only the SERVED answer counts: `getServedHtml` reads the raw body with no
 * hydration in between, so a `dangerouslySetInnerHTML` that only the client would
 * have made visible still fails here.
 *
 * Why it lives in this file and not next to the component's unit spec: the unit
 * spec proves the component does not interpret the body. This proves the whole
 * chain — stub, loader SSR, hydration payload, markup — still does not, which is
 * the only claim that would survive someone adding a sanitiser, a markdown pass
 * or a `v-html` in a template between the query and the bytes.
 */
test.describe("the announcement the operator wrote", () => {
	// The stub's mode is process state, so it is restored after every test here.
	// The default it returns to is the FAILING one: a spec that forgets leaves the
	// suite in the state where a missing announcement costs nothing.
	test.afterEach(async ({ request }) => {
		await setAnnouncementsMode(request, ANNOUNCEMENTS_DEFAULT_MODE);
	});

	/**
	 * The band, out of the served HTML, as a string.
	 *
	 * Scoped on purpose. `<section aria-label="Avisos de Rolé">` has no nested
	 * `<section>`, so the first `</section>` closes it — and every assertion below
	 * is a claim about THE BAND, not about the whole page, which carries React's
	 * own `<script type="module">` tags that have nothing to do with the operator.
	 */
	function bandOf(html: string): string {
		const start = html.indexOf('<section aria-label="Avisos de Rolé"');
		if (start < 0) return "";
		const end = html.indexOf("</section>", start);
		return end < 0 ? "" : html.slice(start, end + "</section>".length);
	}

	/** Opening tag names, in order — the element inventory of a fragment. */
	function tagsOf(fragment: string): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const match of fragment.matchAll(/<([a-z][a-z0-9]*)\b/gi)) {
			const tag = match[1]?.toLowerCase() ?? "";
			counts[tag] = (counts[tag] ?? 0) + 1;
		}
		return counts;
	}

	/**
	 * The band is part of the navbar, not of the page.
	 *
	 * The `<header>` is `fixed`, so the first child of `<main>` renders UNDERNEATH
	 * it: the band served as a translucent strip behind a `backdrop-blur` header —
	 * the navbar read as a white bar, and the operator's announcement was invisible
	 * until you scrolled, at which point the navbar turned solid and covered its
	 * own strip. Reserving height with a `pt` on `<main>` was the wrong fix, twice
	 * over: padding clears nothing, it opens a hole, and it pushed a `Hero` that is
	 * `min-h-[100vh] flex items-center` off the screen.
	 *
	 * So the assertion is a POSITION claim, and it is structural rather than
	 * cosmetic: the band must be inside the `<header>`, which is the only place
	 * where there is nothing left to overlap. A band back in `<main>` — where it
	 * used to be, and where it would pass every other test in this file — fails
	 * here.
	 *
	 * The `data-solid` half is what makes the band follow the navbar's colour
	 * change instead of keeping a background of its own that disagrees with the
	 * header. It is asserted as a `false` on purpose: on the server the navbar has
	 * not measured anything yet, so the band must not claim to be solid while the
	 * dark hero is still behind it.
	 */
	test("serves the band inside the fixed header, and never with its own solid look", async ({
		request,
	}) => {
		await setAnnouncementsMode(request, "hostil");
		const { status, html } = await getServedHtml(request, "/");
		expect(status).toBe(200);

		const headerStart = html.indexOf("<header");
		const headerEnd = html.indexOf("</header>");
		const bandStart = html.indexOf('<section aria-label="Avisos de Rolé"');

		expect(bandStart, "the band must be in the served HTML").toBeGreaterThan(-1);
		expect(headerStart).toBeGreaterThan(-1);
		expect(headerEnd).toBeGreaterThan(headerStart);
		expect(
			bandStart,
			"the band must be INSIDE the header — the header is fixed, so anything in <main> renders under it",
		).toBeGreaterThan(headerStart);
		expect(bandStart).toBeLessThan(headerEnd);

		// The state the band styles itself against, published by the navbar.
		const headerTag = html.slice(headerStart, html.indexOf(">", headerStart));
		expect(headerTag).toContain("group");
		expect(headerTag).toMatch(/data-solid="(true|false)"/);
		// Unmeasured on the server: false, never true.
		expect(headerTag).toContain('data-solid="false"');

		// And no page-level offset was reintroduced to compensate.
		const mainTag = html.match(/<main\b[^>]*>/)?.[0] ?? "";
		expect(mainTag, "the <main> must be in the served HTML").not.toBe("");
		expect(mainTag).not.toContain("pt-14");
	});

	test("is served as inert text: escaped in the bytes, and with no element of its own", async ({
		request,
	}) => {
		await setAnnouncementsMode(request, "hostil");
		const { status, html } = await getServedHtml(request, "/");

		expect(status).toBe(200);
		const band = bandOf(html);
		expect(band, "the announcement band must be in the served HTML").not.toBe("");

		// ── The text is there, ESCAPED. These are the operator's characters. ────
		expect(band).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(band).toContain("&lt;b&gt;negrita&lt;/b&gt;");
		expect(band).toContain("&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
		expect(band).toContain("&lt;b&gt;esta noche&lt;/b&gt;");

		// ── And nothing of it became an element. ───────────────────────────────
		// Asserted on the FORMS, not on the substrings. `javascript:` and
		// `onerror=` DO appear inside the band — as text, escaped, which is exactly
		// what a correct render looks like. The dangerous forms are the ones where
		// the parser saw an attribute or a tag: `<a href="javascript:` and
		// `onerror="`. Asserting the bare substring instead would either be a lie or
		// a false positive that reads like a security finding.
		expect(band).not.toContain("<script");
		expect(band).not.toContain("<b>");
		expect(band).not.toContain("<img");
		expect(band).not.toContain("<a ");
		expect(band).not.toContain('<a href="javascript:');
		expect(band).not.toContain('onerror="');
		expect(band).not.toContain('onload="');
		expect(band).not.toContain("<iframe");
		expect(band).not.toContain("<style");
	});

	test("builds no element at all: the inventory matches a benign announcement", async ({
		request,
	}) => {
		// The form that survives `<svg onload>`.
		//
		// "There is no <svg> in the band" is not an available assertion: the
		// component's own `Megaphone` icon IS an `<svg>`, so that check fails on a
		// healthy render and looks like a security finding when it does. A DIFF
		// against the same announcement with harmless text is the version that
		// discriminates: whatever the operator wrote added zero elements, and the
		// icon is present on both sides so it cannot interfere.
		await setAnnouncementsMode(request, "hostil");
		const hostil = bandOf((await getServedHtml(request, "/")).html);

		await setAnnouncementsMode(request, "benigno");
		const benigno = bandOf((await getServedHtml(request, "/")).html);

		expect(hostil).not.toBe("");
		expect(benigno).not.toBe("");
		expect(tagsOf(hostil)).toEqual(tagsOf(benigno));
		// Spelled out, so a new icon or wrapper has to be a decision and not a
		// silent addition to the baseline.
		expect(tagsOf(benigno)).toEqual({
			section: 1,
			div: 1,
			span: 1,
			svg: 1,
			path: 3,
			ul: 1,
			li: 1,
			p: 2,
		});
	});

	test("a failing announcements API is served as `failed`, not as `loading`", async ({
		request,
	}) => {
		// The observable contract of the degradation, on the bytes.
		//
		// This attribute exists because the API service refuses to answer `[]` on
		// failure *so that the landing cannot hide the incident*. That promise is
		// only kept if the served HTML says `failed` — and it did not, for a while:
		// the page recomputed the value from its own observer, and an observer in
		// SSR returns the OPTIMISTIC result, which is `pending` whenever there is
		// no data. A crawler read `loading`, which means "slow", for an API that
		// was down. A client-side `waitFor` never caught it: by the time the
		// browser's own fetch resolves, the observer does say `failed`.
		//
		// So this asserts the served bytes, with the stub in its default state
		// (`caido`), which is what every other spec in this suite runs against.
		const { status, html } = await getServedHtml(request, "/");

		expect(status).toBe(200);
		expect(html).toContain('data-announcements-source="failed"');
		expect(html).not.toContain('data-announcements-source="loading"');
		// And the degradation costs the visitor nothing: no band, but the page —
		// including the subscription CTA this site exists for — is fully served.
		expect(bandOf(html)).toBe("");
		expect(html).toContain("Únete a Rolé");
	});
});
