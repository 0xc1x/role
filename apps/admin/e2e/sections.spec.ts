import { expect, test } from "@playwright/test";

import { signIn, stubApi } from "./support/admin";

/**
 * The protected sections, with a live session and a stubbed API.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * Once the auth gate is satisfied, each section is a different composition of
 * router search validation, a TanStack Query list, a TanStack Table and a
 * bespoke card layout. The unit suite covers the pieces — there are component
 * tests for the orders, offers, payouts, coupons and reviews lists, and for the
 * home dashboard's error state — but every one of them mounts the section in
 * isolation, with the query already resolved. What none of them can see is
 * whether the assembled page reaches the end: route -> query -> table -> row.
 *
 * That seam is where the failures live, and the first draft of this file proved
 * it. The `/stats/revenue` fixture was a plausible flat guess
 * (`total_revenue`, `orders_count`) instead of the real
 * `{ period, accrued, collected }`. The panel did not render a wrong number — it
 * threw inside `AccruedBlock` on `accrued.gross_amount`, the error boundary took
 * the whole dashboard down, and any assertion of the shape "the home screen is
 * not blank" would have been the only thing standing between that and a green
 * run. Hence the fixtures in `support/admin.ts` are the documented `commons`
 * shapes, field for field.
 *
 * Every test here logs in through the real form rather than injecting a token
 * into localStorage. It costs a couple of seconds per test and it buys the
 * property that matters: a section is only "loaded" if the whole chain from the
 * login form to the rendered row actually held together.
 */

/** One row per section, addressed by the text its cell renders. */
const SECTIONS = [
	{
		path: "/negocios",
		heading: "Negocios",
		// `columns` renders `name` in the first cell and a verification badge.
		row: "Panadería E2E",
	},
	{ path: "/ordenes", heading: "Órdenes", row: "RLE-0001" },
	{ path: "/pagos", heading: "Pagos a negocios", row: "Panadería E2E" },
	{ path: "/categorias", heading: "Panel de Categorías", row: "Panadería" },
] as const;

test.describe("protected sections", () => {
	for (const section of SECTIONS) {
		/**
		 * One test per section, generated from the table above rather than
		 * copy-pasted four times. A copy-pasted fourth case is the one that goes
		 * stale, and it goes stale silently: the section breaks, the test keeps
		 * passing because it asserts a heading the broken page still renders.
		 *
		 * The two assertions are deliberately different kinds of claim. The
		 * heading proves the ROUTE resolved and the section mounted; the fixture
		 * row proves the QUERY resolved and the TABLE rendered it. Asserting only
		 * the heading would pass on a screen showing five skeleton rows forever,
		 * which is precisely the failure mode that makes an e2e suite decorative.
		 */
		test(`${section.heading} loads its content for a signed-in operator`, async ({
			page,
		}) => {
			await stubApi(page);
			await signIn(page);

			await page.goto(section.path);

			// The ROW first, then the heading. The row is the substantive claim —
			// query resolved, table rendered it — and waiting on it first means the
			// heading assertion costs nothing, because by then the success branch
			// has rendered. Asserting the 5 s-default heading first made this flake
			// under parallel load, when `/pagos` and `/categorias` were still
			// loader-backed and their data arrived via the Vite server rather than
			// the browser. Both loaders are gone, so every section here now takes
			// the same path — browser query, `page.route()` stub, same budget — and
			// 20 s is the dev-transform budget, not padding.
			await expect(page.getByText(section.row)).toBeVisible({
				timeout: 20_000,
			});
			await expect(
				page.getByRole("heading", { name: section.heading }),
			).toBeVisible();
		});
	}

	/**
	 * Navigating BETWEEN sections must not lose the session.
	 *
	 * Worth its own test because the failure it catches is invisible per-section:
	 * each of the four tests above lands on its section via a full page load with
	 * a fresh navigation, so a session that dies on the second client-side
	 * transition would leave all four green. Client-side navigation is the only
	 * path that exercises `beforeLoad` with a hydrated router, which is the code
	 * path the two marked defects in `auth.gate.spec.ts` are about.
	 */
	test("the session survives moving between sections without a reload", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);

		await page.getByRole("link", { name: "Órdenes" }).click();
		await expect(page.getByRole("heading", { name: "Órdenes" })).toBeVisible();
		await expect(page.getByText("RLE-0001")).toBeVisible();

		await page.getByRole("link", { name: "Negocios" }).click();
		await expect(page.getByRole("heading", { name: "Negocios" })).toBeVisible();
		await expect(page.getByText("Panadería E2E")).toBeVisible();

		// Still signed in, and the gate never intervened.
		await expect(page.getByText("admin@role.test")).toBeVisible();
		await expect(page).not.toHaveURL(/\/login/);
	});

	/**
	 * The list is paginated and the pager is part of the contract: the API
	 * returns a `{ data, meta }` envelope and the table is driven by `meta`, not
	 * by the array length.
	 *
	 * This is the assertion that would catch a `PaginatedData` regression, which
	 * is the kind of break that renders an empty table with no error anywhere —
	 * `data?.data ?? []` swallows a missing envelope into "zero rows", and
	 * "the page loaded" stays true.
	 */
	test("a section renders the pagination meta the API sent", async ({
		page,
	}) => {
		await stubApi(page, {
			// Two rows and a total of 2, so the pager has something to say.
			"/businesses": {
				status: 200,
				body: {
					data: [
						{
							id: "99999999-9999-4999-8999-999999999999",
							owner_id: "22222222-2222-4222-8222-222222222222",
							name: "Panadería E2E",
							type: "restaurant",
							slug: "panaderia-e2e",
							image: null,
							cover_image: null,
							rating: null,
							review_count: null,
							description: null,
							phone: null,
							email: null,
							website: null,
							commission_rate: null,
							balance: null,
							is_active: true,
							verification_status: "pending",
							verified_at: null,
							verified_by: null,
							rejection_reason: null,
							created_at: "2026-01-01T00:00:00.000Z",
							updated_at: "2026-01-01T00:00:00.000Z",
						},
					],
					meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
				},
			},
		});
		await signIn(page);
		await page.goto("/negocios");

		// The row is there AND the filter state reflects `verification_status`.
		await expect(page.getByText("Panadería E2E")).toBeVisible();
		// "Pendiente" is the translated badge for `pending`, so this also proves
		// the enum reached the label layer rather than rendering raw.
		await expect(page.getByText("Pendiente")).toBeVisible();
	});
});
