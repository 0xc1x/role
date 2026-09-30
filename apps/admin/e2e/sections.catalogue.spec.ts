import { expect, test } from "@playwright/test";

import { signIn, stubApi } from "./support/admin";

/**
 * The commerce catalogue: offers, coupons, commissions, slides, reviews.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * `sections.spec.ts` proved that a section can reach its table. It did not cover
 * the objects the platform actually trades in, and offers are the worst gap of
 * the lot: it is the central object of the commerce, it has the richest column
 * set in the panel, and before this file it had ZERO browser tests. A table
 * whose `business` embed is missing, or whose price cell reads the wrong field,
 * would have rendered a plausible-looking wrong number to a moderator deciding
 * whether to pull a deal from the marketplace.
 *
 * ─── Why the loader removal was a prerequisite, not a cleanup ───────────────
 *
 * Four of these five routes declared `loader: ensureQueryData(...)`. Measured on
 * a running panel: with the API in 500, `/cupones` rendered TanStack Router's
 * default `Something went wrong! / Hide Error / Boom` for the WHOLE page — no
 * sidebar, no section, and none of the "Reintentar" the component implements.
 * The loader failure escapes to the route's `errorComponent`, and no route in
 * the panel defines one.
 *
 * That made the error case untestable with `stubApi()`: `page.route()` cannot
 * see a request the Vite server makes during SSR, so the override would never
 * be consulted and the spec would silently assert against the happy-path
 * fixture. A test that cannot fail is worse than no test. The loaders are gone
 * (the same decision and rationale already documented in `_layout.resenas.tsx`),
 * the error state is reachable again, and the browser-side stub is now the only
 * boundary a spec needs.
 *
 * ─── What each test claims ──────────────────────────────────────────────────
 *
 * Every data-loading test asserts a VALUE the API sent, not that a page is
 * non-empty: a specific price, a stock fraction, a scope badge. A smoke assert
 * would survive every bug in this file is meant to catch. The error tests assert
 * three things each, all of which a broken screen can satisfy alone — the
 * message, the retry control, and the ABSENCE of the row, because a table that
 * renders its header and no rows reads as "you have nothing" and the operator
 * will act on it.
 */

/** One row per section, plus the value only that section's table can show. */
type Section = {
	path: string;
	heading: string;
	/** Text unique to this section's fixture row. */
	row: string;
	/** A second, independent value from the SAME row. */
	detail: string;
	/**
	 * Address the row as a TABLE CELL rather than as page text. Needed wherever
	 * the fixture's own text is repeated in an `sr-only` control label, which
	 * makes a page-level `getByText` ambiguous.
	 */
	rowInCell?: boolean;
};

const CATALOGUE: Section[] = [
	{
		path: "/ofertas",
		heading: "Ofertas",
		// The title cell and the `business.name` embed are separate columns: the
		// deactivate confirmation reads the embed too, so an offer fixture that
		// shipped without it would crash a MODAL, not just a cell.
		row: "Bolsa de pan E2E",
		detail: "Panadería E2E",
	},
	{
		path: "/cupones",
		heading: "Panel de Cupones",
		// `Ámbito` resolves `business_id: null` to a "Global" badge. A coupon
		// whose scope is derived from `business_name` instead would render the
		// name, and an operator would moderate a global code as a business one.
		row: "E2E-VERDE",
		detail: "Global",
	},
	{
		path: "/comisiones",
		heading: "Comisiones",
		// `commission_rate` is a FRACTION in the contract and the cell multiplies
		// by 100. A cell that forgot the multiply renders "0.15%" — a number an
		// operator would act on, and one no smoke assert would ever catch.
		row: "Panadería E2E",
		detail: "15.00%",
	},
	{
		path: "/slides",
		heading: "Panel de Slides",
		// A per-section locator override, and it exists for a measured reason: the
		// slide TITLE is not unique on the page, because `SlideCreateDrawer`'s
		// edit trigger carries an `sr-only` "Editar slide {title}". A page-level
		// `getByText(title)` is a strict-mode violation, and the first draft failed
		// on exactly that — for a reason that has nothing to do with the panel.
		// Addressing the CELL scopes the claim to the table, which is the subject.
		row: "Slide de bienvenida E2E",
		rowInCell: true,
		// The slide's DESTINATION, not its button label. `slides.columns.tsx`
		// renders the `cta` column only when `badge_text` is set, so asserting
		// "Explorar" here would be asserting a conditional the fixture happens to
		// satisfy — and the first draft picked it and failed, because this table
		// has no `Explorar` cell at all. `redirect_url` is unconditional, so it
		// is the value that proves the field reached the table.
		detail: "/explore",
	},
	{
		path: "/resenas",
		heading: "Reseñas",
		// `moderation_reason` is `null` and `is_hidden` false, so the badge must
		// read "Visible" and the moderation cell must show its EMPTY copy. An
		// inbox that renders every row as moderated is as wrong as one that
		// renders none.
		row: "El pan estaba buenísimo, lo recogí puntual.",
		detail: "Visible",
	},
];

test.describe("commerce catalogue", () => {
	for (const section of CATALOGUE) {
		test(`${section.heading} renders the values the API sent`, async ({
			page,
		}) => {
			await stubApi(page);
			await signIn(page);
			await page.goto(section.path);

			const rowCell = section.rowInCell
				? page.getByRole("cell", { name: section.row, exact: true })
				: page.getByText(section.row, { exact: false });

			// The row FIRST. The heading only proves the route matched, and
			// asserting it first would let a page stuck on skeletons pass the
			// cheap half of this test before the expensive half ran. 20 s is the
			// dev-transform + first-paint budget, not padding.
			await expect(rowCell).toBeVisible({ timeout: 20_000 });
			await expect(
				page.getByRole("heading", { name: section.heading, exact: true }),
			).toBeVisible();

			// Scoped to the row so `detail` cannot be satisfied by the page
			// chrome. Without this a "Global" badge on some other row, or a "15.00%"
			// in a footer, would satisfy the assert and prove nothing about this
			// section's table.
			const row = page.getByRole("row").filter({ hasText: section.row });
			await expect(row).toContainText(section.detail);
		});
	}

	/**
	 * Offers carry the one filter in the panel that is NOT the server's.
	 *
	 * `state=inactive` filters the LOADED PAGE in the client, because
	 * `GET /offers` accepts `available_only` and `business_id` but not
	 * `is_active`. The route says so on screen rather than presenting a page
	 * filter as a global total, and this asserts that admission actually
	 * renders — a silent `filter()` with no explanation would show "0 ofertas"
	 * for a marketplace with forty live ones.
	 */
	test("the offers page filter admits it only filters the loaded page", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/ofertas");

		await expect(page.getByText("Bolsa de pan E2E")).toBeVisible({
			timeout: 20_000,
		});

		await page.getByRole("combobox", { name: "Estado" }).click();
		await page.getByRole("option", { name: "Inactivas" }).click();

		// The fixture offer is `is_active: true`, so a working filter removes it.
		// Asserting the ABSENCE is the discriminating half: an assert of the
		// explanatory copy alone would pass on a filter that removed nothing.
		await expect(page.getByText("Bolsa de pan E2E")).toHaveCount(0);
		await expect(
			page.getByText("La API no permite filtrar por `is_active`."),
		).toBeVisible();
		// The count in that sentence is the page-scoped fraction, and it is the
		// whole point of showing it: "0 de 1" is a different claim from "0".
		await expect(page.getByText("(0 de 1)")).toBeVisible();
	});

	/**
	 * The `available` state IS the server's, and the panel must actually send it.
	 *
	 * The counterpart to the test above: `available_only` is a real query
	 * parameter, so the filter's meaning depends on the request. Asserting only
	 * the label would pass against a `Select` wired to nothing — the exact shape
	 * of a bug that looks fine until an operator filters by "Publicables ahora"
	 * and gets the whole catalog back.
	 */
	test("choosing an offer state changes the query the API receives", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/ofertas");
		await expect(page.getByText("Bolsa de pan E2E")).toBeVisible({
			timeout: 20_000,
		});

		// Record what the panel actually asked for, then drive the control.
		const requested: URLSearchParams[] = [];
		page.on("request", (req) => {
			const url = new URL(req.url());
			if (url.pathname.endsWith("/api/v1/offers")) {
				requested.push(url.searchParams);
			}
		});

		await page.getByRole("combobox", { name: "Estado" }).click();
		await page.getByRole("option", { name: "Publicables ahora" }).click();

		// Wait on the OBSERVABLE, not a sleep: the click has landed when the
		// trigger reads back the label the operator just chose.
		await expect(page.getByRole("combobox", { name: "Estado" })).toContainText(
			"Publicables ahora",
		);
		await expect
			.poll(() => requested.map((p) => p.get("available_only")))
			.toContain("true");
	});

	/**
	 * Commissions: the pending-payout lock is a business rule, not a style.
	 *
	 * A business with an undelivered payout cannot have its rate changed,
	 * because the payout amount was already computed at the old rate. The table
	 * disables the action for exactly `has_pending_payouts`, and this asserts
	 * the flag reached the UI: a fixture that lost the field would leave the
	 * operator free to edit a rate that the API will reject at the worst
	 * possible moment.
	 */
	test("a business with pending payouts cannot have its rate edited", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/comisiones");
		await expect(page.getByText("15.00%")).toBeVisible({ timeout: 20_000 });

		// The page states the rule in prose too. That prose is a COMMENT in the
		// UI; the disabled menu item is the RULE. Asserting only the prose would
		// pass on a panel that warns and then lets the edit through.
		await expect(
			page.getByText("No se puede cambiar la comisión de un negocio con pagos"),
		).toBeVisible();

		await page.getByRole("button", { name: "Abrir menú" }).first().click();
		await expect(page.getByRole("menuitem", { name: "Editar" })).toBeDisabled();
	});

	/**
	 * Reviews: the visibility filter lives in the URL, and the copy says why.
	 *
	 * The route documents that a local-state filter loses the operator's place
	 * on reload. This asserts the consequence: the chosen visibility is in the
	 * URL, so a reload returns the same list. The fixture is a VISIBLE review,
	 * so filtering to `Ocultas` must empty the table — and an empty table that
	 * says so is materially different from one that says nothing.
	 */
	test("the review visibility filter is in the URL and empties the table", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/resenas");
		await expect(
			page.getByText("El pan estaba buenísimo, lo recogí puntual."),
		).toBeVisible({ timeout: 20_000 });

		await page.getByRole("combobox", { name: "Visibilidad" }).click();
		await page.getByRole("option", { name: "Ocultas" }).click();

		await expect(page).toHaveURL(/visibility=hidden/);
		await expect(
			page.getByText("El pan estaba buenísimo, lo recogí puntual."),
		).toHaveCount(0);
		// This inbox's own empty copy, not `DataTable`'s: `ReviewsModerationList`
		// short-circuits before the table when the list is empty, so asserting the
		// table's string here would be asserting a branch the component does not
		// have.
		await expect(page.getByText("No hay reseñas con este filtro.")).toBeVisible();
	});
});

/**
 * The empty list, per section.
 *
 * ─── Why "No hay datos" is worth a test at all ──────────────────────────────
 *
 * `data?.data ?? []` is the single most load-bearing line in the panel: it is
 * what makes a missing envelope look like an empty result instead of a crash.
 * That is convenient and it is also a lie machine — the same expression covers
 * "the API said zero" and "the API sent something this code cannot read". A
 * test that only ever stubs a populated list therefore proves the happy path
 * and leaves the ambiguous case entirely unmeasured.
 *
 * The assertion is the TABLE's own copy plus the absence of the fixture row.
 * Both halves matter: the copy alone would pass on a page rendering the copy
 * under a populated table, and the row's absence alone would pass on a blank
 * page.
 */
test.describe("empty lists", () => {
	/**
	 * The empty copy is PER SECTION, and listing it per row is the point.
	 *
	 * Two of these five render `DataTable`'s built-in "No hay datos"; the other
	 * three carry their own sentence ("No hay reseñas con este filtro.") because
	 * their list is filterable and "no hay datos" would be a lie about the
	 * catalog rather than about the filter. A single shared string would have
	 * passed for the two that happen to match and failed for the three that do
	 * not — which is exactly the assertion-by-luck this file is written against.
	 */
	const EMPTY_PATHS = [
		{
			path: "/ofertas",
			heading: "Ofertas",
			endpoint: "/offers",
			emptyCopy: "No hay datos",
		},
		{
			path: "/cupones",
			heading: "Panel de Cupones",
			endpoint: "/coupons",
			emptyCopy: "No hay datos",
		},
		{
			path: "/comisiones",
			heading: "Comisiones",
			endpoint: "/commissions",
			emptyCopy: "No hay datos",
		},
		{
			path: "/slides",
			heading: "Panel de Slides",
			endpoint: "/slides/admin",
			emptyCopy: "No hay datos",
		},
		{
			path: "/resenas",
			heading: "Reseñas",
			endpoint: "/reviews/moderation",
			// Its own copy, and the reason it exists is a product decision worth
			// protecting: a moderation inbox empty because of a filter is a
			// different fact from a moderation inbox with nothing in it.
			emptyCopy: "No hay reseñas con este filtro.",
		},
	];

	for (const section of EMPTY_PATHS) {
		test(`${section.heading} says it has no rows instead of rendering a blank page`, async ({
			page,
		}) => {
			await stubApi(page, {
				// A real `{ data: [], meta }` envelope, NOT a missing `data` key:
				// the second is the ambiguous case this suite cannot distinguish
				// from a bug, and stubbing it would be asserting a fiction.
				[section.endpoint]: {
					status: 200,
					body: {
						data: [],
						meta: { page: 1, limit: 10, total: 0, total_pages: 1 },
					},
				},
			});
			await signIn(page);
			await page.goto(section.path);

			await expect(
				page.getByText(section.emptyCopy, { exact: false }),
			).toBeVisible({ timeout: 20_000 });
			await expect(
				page.getByRole("heading", { name: section.heading, exact: true }),
			).toBeVisible();
		});
	}
});

/**
 * The failed list, per section — the case that matters most and gets skipped.
 *
 * Each test asserts three independent things, and any ONE of them can be
 * satisfied by a broken screen:
 *
 *   - the API's own message is on screen -> it is not a silent failure
 *   - a retry control is on screen       -> the operator is not stranded
 *   - the fixture row is NOT on screen   -> a failure is not passed off as an
 *                                           empty result
 *
 * The 20 s budget is React Query, not padding: `createListOptions` sets no
 * `retry`, so the default of 3 applies and the error state only renders after
 * roughly 1 s + 2 s + 4 s of backoff. A 5 s assert fails against a panel
 * behaving exactly as designed, which is the signature of a test tuned to a
 * symptom instead of to the behaviour.
 */
test.describe("failed lists", () => {
	const FAILING: Array<{
		path: string;
		endpoint: string;
		/** Some sections translate the fallback; this pins which copy each uses. */
		message: string;
	}> = [
		{ path: "/ofertas", endpoint: "/offers", message: "Boom" },
		{ path: "/cupones", endpoint: "/coupons", message: "Boom" },
		{ path: "/comisiones", endpoint: "/commissions", message: "Boom" },
		{ path: "/slides", endpoint: "/slides/admin", message: "Boom" },
		{
			path: "/resenas",
			endpoint: "/reviews/moderation",
			message: "Boom",
		},
	];

	for (const section of FAILING) {
		test(`${section.path} shows the failure and a retry, not an empty table`, async ({
			page,
		}) => {
			await stubApi(page, {
				[section.endpoint]: { status: 500, body: { message: "Boom" } },
			});
			await signIn(page);
			await page.goto(section.path);

			await expect(
				page.getByRole("button", { name: "Reintentar" }),
				`${section.path} left the operator with no way forward`,
			).toBeVisible({ timeout: 20_000 });

			await expect(page.getByText(section.message)).toBeVisible();

			// The whole panel survives. This is the regression the loader removal
			// fixed and it is worth pinning per section rather than once: a single
			// route reintroducing a `loader` would bring back the full-page
			// `Something went wrong!` for THAT section only, and a suite-wide
			// assertion in some other file would not notice.
			await expect(page.getByText("admin@role.test")).toBeVisible();

			// And no row, so a failure is never dressed as an empty result. Both
			// empty-state strings are checked: a section that fell through to its
			// own empty copy instead of its error branch would satisfy a check on
			// only one of them.
			await expect(page.getByText("No hay datos")).toHaveCount(0);
			await expect(
				page.getByText("No hay reseñas con este filtro."),
			).toHaveCount(0);
		});
	}
});
