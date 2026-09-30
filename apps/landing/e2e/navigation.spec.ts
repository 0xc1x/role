import { expect, getServedHtml, gotoHydrated, test } from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * A navigation link that points at a route the router does not mount is the
 * cheapest defect in the app to introduce and the most expensive one to leave:
 * it compiles, it type-checks, `bun test src` stays green, and the only
 * evidence is a user clicking a header that looks fine.
 *
 * The link set is also duplicated between `navbar.tsx` and `footer.tsx`, so a
 * rename or a re-route has to land in two files. Nothing enforces that today.
 * These specs read the hrefs out of the served HTML instead of restating them
 * in TypeScript, which means a link that is deleted from the app cannot survive
 * here as a passing expectation.
 */
test.describe("navigation links resolve", () => {
	test("every header link is an internal route the server actually serves", async ({
		request,
		page,
	}) => {
		await gotoHydrated(page, "/");

		const hrefs = await page
			.locator('nav[aria-label="Principal"] a')
			.evaluateAll((links) =>
				links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
			);

		// Guard on the guard: if the selector ever stops matching, an empty list
		// would make the loop below trivially true and the test would pass while
		// checking nothing.
		expect(hrefs.length).toBeGreaterThan(0);

		for (const href of hrefs) {
			expect(href.startsWith("/"), `${href} should be an internal route`).toBe(
				true,
			);
			const { status, html } = await getServedHtml(request, href);
			expect(status, `${href} must be served`).toBe(200);
			expect(html, `${href} must not render the 404 page`).not.toContain(
				"Esta oferta se agotó",
			);
		}
	});

	test("every footer link is an internal route the server actually serves", async ({
		request,
		page,
	}) => {
		await gotoHydrated(page, "/");

		// The footer repeats the nav plus the two legal routes, and that second
		// set is the one with no other coverage: /terms and /privacy are
		// reachable from nowhere else in the UI.
		const hrefs = await page
			.locator("footer a")
			.evaluateAll((links) =>
				links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
			);

		const internal = hrefs.filter(
			(h) => h.startsWith("/") && !h.startsWith("/#"),
		);
		expect(internal.length).toBeGreaterThan(0);

		for (const href of internal) {
			const { status } = await getServedHtml(request, href);
			expect(status, `${href} must be served`).toBe(200);
		}
	});

	test("clicking a header link navigates client-side to the right page", async ({
		page,
	}) => {
		// The href sweep above proves the destination exists; it says nothing
		// about the click handler. This is the route the SPA path actually
		// takes, and it is a different code path from a full page load.
		await gotoHydrated(page, "/");
		await page
			.locator('nav[aria-label="Principal"] a', { hasText: "Cómo funciona" })
			.click();

		await expect(page).toHaveURL(/\/how-it-works$/);
		await expect(
			page.getByRole("heading", { level: 1, name: "¿Cómo funciona Rolé?" }),
		).toBeVisible();
	});

	test("the wordmark returns to the home page", async ({ page }) => {
		await gotoHydrated(page, "/about");
		await page.locator('a[aria-label="Rolé — Inicio"]').first().click();

		await expect(page).toHaveURL(/\/$/);
		await expect(
			page.getByText("La comida que sobra no tiene que perderse."),
		).toBeVisible();
	});
});
