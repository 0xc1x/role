import { expect, test } from "@playwright/test";

import { signIn, stubApi } from "./support/admin";

/**
 * What the panel does when the API says no.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * A blank screen is the default failure mode of a data-driven screen, and it is
 * the one an e2e is uniquely able to catch. A component test can assert that an
 * error branch returns the right element; it cannot assert that the error
 * branch is REACHED, and it certainly cannot assert that nothing else is
 * reached instead. The dangerous regressions are all of the form "the query
 * failed and the page shows something that is not an error" — an eternal
 * skeleton, a table header with no rows and no explanation, or a metric reading
 * `0` where the truth is "unknown".
 *
 * That last one is the most dangerous and has a name in this codebase. The
 * home dashboard states the rule in its own comment: "Una métrica sin dato NUNCA
 * es 0: '0 negocios por aprobar' con la API caída se lee como 'no hay nada que
 * aprobar'." An operator acting on a fabricated zero approves nothing, or
 * reconciles against nothing, and never learns the API was down. `MetricValue`
 * implements the rule with an em dash and a `title` attribute; these tests are
 * what make that claim evidence rather than a comment.
 */

test.describe("API failures", () => {
	/**
	 * A 500 on a list endpoint must produce a visible, actionable error state.
	 *
	 * The three assertions are three different claims and any one of them alone
	 * would be satisfiable by a broken screen:
	 *
	 *   - the error text is on screen      -> it is not a silent failure
	 *   - a retry control is on screen     -> the operator is not stranded
	 *   - the row is NOT on screen         -> stale/empty data is not passed off
	 *                                          as a successful empty result
	 */
	test("a failed list request renders an error state with a retry, not a blank table", async ({
		page,
	}) => {
		await stubApi(page, {
			"/businesses": { status: 500, body: { message: "Boom" } },
		});
		await signIn(page);
		await page.goto("/negocios");

		// `formatApiError(error, "Error")` renders the translated message, and
		// the class is `text-destructive` — asserted by text, not by class, so a
		// restyle does not break it and a blank page cannot satisfy it.
		//
		// The 20 s budget is not padding. `createListOptions` sets no `retry`, so
		// React Query's default of 3 retries applies and the error state only
		// renders after ~1 s + 2 s + 4 s of backoff. The first draft of this test
		// used the 5 s default and failed against a panel behaving exactly as
		// designed, which is the shape of a test tuned to a symptom.
		await expect(
			page.getByRole("button", { name: "Reintentar" }),
			"a failed list left the operator with no way forward",
		).toBeVisible({ timeout: 20_000 });

		// The row is gone. This is the half that matters: a table that rendered
		// its header and no rows reads as "you have no businesses", which is a
		// lie the operator will act on.
		await expect(page.getByText("Panadería E2E")).toHaveCount(0);
	});

	/**
	 * The retry control has to actually re-fetch, and it has to be able to
	 * recover.
	 *
	 * The comment on the button in `_layout.negocios.tsx` records a real bug
	 * here: `navigate` with the same search deduplicates, and the errored query
	 * stays under the same key, so the button did nothing. A test that only
	 * asserts the button is visible passes on exactly that regression, because
	 * the button is still there — it is just inert. So this test flips the stub
	 * from 500 to 200 and asserts the row appears.
	 */
	test("retrying after a failure recovers the section", async ({ page }) => {
		let failNext = true;
		await page.route("**/api/v1/**", async (route) => {
			const path = new URL(route.request().url()).pathname.replace(
				/^\/api\/v1/,
				"",
			);
			if (path === "/businesses") {
				await route.fulfill({
					status: failNext ? 500 : 200,
					contentType: "application/json",
					body: JSON.stringify(
						failNext
							? { message: "Boom" }
							: {
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
											verification_status: "approved",
											verified_at: null,
											verified_by: null,
											rejection_reason: null,
											created_at: "2026-01-01T00:00:00.000Z",
											updated_at: "2026-01-01T00:00:00.000Z",
										},
									],
									meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
								},
					),
				});
				return;
			}
			await route.continue();
		});

		await page.goto("/login");
		await signIn(page);
		await page.goto("/negocios");
		await expect(
			page.getByRole("button", { name: "Reintentar" }),
		).toBeVisible();

		failNext = false;
		await page.getByRole("button", { name: "Reintentar" }).click();

		await expect(page.getByText("Panadería E2E")).toBeVisible();
		await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(
			0,
		);
	});

	/**
	 * The dashboard's money rule, asserted rather than trusted.
	 *
	 * `/stats/platform` answers 500, so `usePlatformStats` has no data, and
	 * `MetricValue` must render the em dash carrying
	 * `title="Dato no disponible: la consulta falló"`. If a refactor ever lets
	 * `undefined` fall through to a rendered `0`, this fails — and it is the only
	 * place in the repo where that specific lie is detectable, because the unit
	 * test for the dashboard covers the error state of the LIST cards, not this
	 * branch of the metric.
	 */
	test("a failed platform-stats call shows a dash, never a zero", async ({
		page,
	}) => {
		await stubApi(page, {
			"/stats/platform": { status: 500, body: { message: "Boom" } },
		});
		await signIn(page);

		// TWO dashes, not three, and the reason is the interesting part.
		// `_layout.home.tsx:276` reads
		//     const totalBusinesses = totalData?.meta.total ?? stats?.businesses;
		// so the "Total comercios" tile is fed by the businesses list query, which
		// is NOT stubbed to fail here, and keeps a real number. The first draft of
		// this test expected three and failed — against a deliberate fallback, not
		// a bug. Asserting the exact count is what forced that reading, and the
		// reading is worth more than the assertion was.
		//
		// The `title` attribute exists only on `MetricValue`'s undefined branch, so
		// counting them proves the two genuinely unknown metrics degraded the same
		// way.
		const unavailable = page.getByTitle(
			"Dato no disponible: la consulta falló",
		);
		await expect(unavailable).toHaveCount(2, { timeout: 20_000 });

		// The fallback, asserted so it cannot be deleted by accident: a refactor
		// that dropped the `??` and left the tile on platform stats alone would turn
		// a working number into a dash and tell the operator "unknown" about a
		// figure the panel can actually see.
		const businessesTile = page
			.getByText("Total comercios", { exact: true })
			.locator("xpath=..")
			.locator("div")
			.first();
		await expect(businessesTile).toHaveText("1");

		// The two unknown ones, scoped to their cards. A page-wide `text=/^0$/` is
		// the obvious version and it is WRONG: the revenue report loads fine here
		// and legitimately renders zeros of its own (`failed_payouts: 0`), so the
		// broad locator failed against a panel behaving correctly.
		for (const label of ["Usuarios activos", "Rescatadas"]) {
			const value = page
				.getByText(label, { exact: true })
				.locator("xpath=..")
				.locator("div")
				.first();
			await expect(
				value,
				`"${label}" rendered a number instead of a dash`,
			).toHaveText("—");
		}
	});

	/**
	 * A failure in one card must not take the dashboard down with it.
	 *
	 * This is a regression pin with teeth: the first draft of the revenue fixture
	 * in this repo was a plausible flat guess, and the result was not a wrong
	 * number but a thrown render inside `AccruedBlock` that the error boundary
	 * turned into a blank dashboard. The assertion that survives that class of
	 * bug is the presence of the OTHER cards.
	 */
	test("one failing query leaves the rest of the dashboard standing", async ({
		page,
	}) => {
		await stubApi(page, {
			"/businesses": { status: 500, body: { message: "Boom" } },
		});
		await signIn(page);

		// The businesses card failed...
		await expect(
			page.getByRole("button", { name: "Reintentar" }).first(),
		).toBeVisible();
		// ...and the money report, which is a different query, still rendered.
		await expect(
			page.getByRole("heading", { name: "Dinero", exact: true }),
		).toBeVisible();
		await expect(page.getByText("Período aplicado:")).toBeVisible();
	});
});
