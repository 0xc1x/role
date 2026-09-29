import { strings } from "../src/core/i18n/strings";

import {
	BUSINESS_NAME,
	businessBodies,
	businessLocationFixture,
	businessTab,
	businessTablist,
	expect,
	stubSupabase,
	test,
	waitForBusinessShell,
} from "./fixtures";

/**
 * ─── Why the panel's landing screen is a first-class spec ────────────────────
 *
 * `app/(business)/management.tsx` is nine lines, and almost all of the
 * decisions live in the branches it takes:
 *
 * ```tsx
 * if (isLoading) return <GestionContentSkeleton />;
 * if (businessesError) return <ErrorState … />;
 * if (!business) return <NoBusinessPrompt />;
 * return <GestionContent businessId={business.id} />;
 * ```
 *
 * Three of those four render visibly different screens from the same URL, and
 * the middle two are the pair that matters. The screen says so itself:
 *
 * > Un fallo de red o de RLS NO es "todavía no tienes negocio": mostrar el
 * > prompt de alta ahí invita a crear un negocio duplicado.
 *
 * That is a product promise about not costing the owner money, and it is
 * exactly the kind of thing that decays quietly: someone widens a `catch`,
 * someone reuses the empty branch for the error branch, and a transient RLS
 * blip turns into a duplicate business listing. So the two branches are
 * asserted as a PAIR, with the negative case as the load-bearing one.
 */
test.describe("business management screen", () => {
	test("the panel shows THIS owner's business, not an arbitrary one", async ({
		page,
	}) => {
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		// The business name comes from `businesses` resolved THROUGH
		// `business_ownership`, two hops from the session. A panel that
		// rendered a hardcoded or first-row merchant would pass a "something
		// is rendered" check; only the fixture's own name proves the ownership
		// chain was walked.
		await expect(page.getByText(BUSINESS_NAME, { exact: true })).toBeVisible();

		// The panel's own structure is mounted, not just its hero.
		await expect(
			page.getByText(strings.business.gestionTitle, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.myLocations, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.quickActions, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.settingsSection, { exact: true }),
		).toBeVisible();
	});

	test("it reads the owner's businesses through business_ownership", async ({
		page,
	}) => {
		// The tenant boundary, asserted as a REQUEST.
		//
		// `getBusinessesByOwnerId` filters `business_ownership` by
		// `owner_id = auth.uid()` and the RLS policy repeats that filter, so
		// this read is the only thing standing between "my businesses" and
		// "every business". Asserting the rendered name proves the data
		// arrived; asserting the call proves it arrived through the door that
		// is scoped to the viewer.
		const supabase = await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);
		await expect(page.getByText(BUSINESS_NAME, { exact: true })).toBeVisible();

		const ownership = supabase.callsTo("GET", "/rest/v1/business_ownership");
		expect(
			ownership.length,
			"the panel resolved its business without asking business_ownership",
		).toBeGreaterThan(0);
		// And it asked for THIS viewer's row, not somebody else's.
		expect(
			ownership[0]?.route,
			"the ownership read is not the one this suite thinks it is",
		).toBe("GET /rest/v1/business_ownership");
	});

	test("a FAILED ownership read is an error, never 'you have no business'", async ({
		page,
	}) => {
		// The assertion this file exists for.
		//
		// Only the ownership read fails. The splash's config prefetch and
		// every other query still answer, so a blanket black hole could not
		// be mistaken for this state — the spec would be measuring the
		// 6-second splash watchdog instead of the branch it claims to test.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
			fail: {
				business_ownership: {
					code: "42501",
					message: "permission denied for table business_ownership",
				},
			},
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		// A retry affordance — an error state with no way out is
		// indistinguishable from a broken app.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toBeVisible();

		// And the promise: NOT the "register your business" prompt. Showing it
		// here invites the owner to create the duplicate the screen's own
		// comment warns about.
		await expect(
			page.getByText(strings.business.noBusiness, { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText(strings.business.createBusiness, { exact: false }),
		).toHaveCount(0);

		// The raw driver string never reaches the DOM: `toAppError` maps
		// PGRST-style codes to the app's own es-ES copy.
		await expect(page.getByText(/permission denied/i)).toHaveCount(0);
	});

	test("an EMPTY ownership read IS the 'no business' prompt", async ({
		page,
	}) => {
		// The mirror of the previous test, and it is what makes the pair
		// meaningful: one assertion with no counterpart proves nothing about
		// which branch is which.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies({ business_ownership: [] }),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		await expect(
			page.getByText(strings.business.noBusiness, { exact: true }),
		).toBeVisible();
		// With a way to fix it, and a way out if this was the wrong account.
		await expect(
			page.getByText(strings.business.createBusiness, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.auth.signOut, { exact: true }),
		).toBeVisible();
		// And no retry button: retrying an empty answer would not change it.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);
	});

	test("an owner with no locations gets the create-location affordance", async ({
		page,
	}) => {
		// Distinct from the previous test: the business EXISTS, the business
		// has no branches. The panel must not collapse the two into one
		// "nothing here" screen — a business with a profile and no locations
		// is a real, recoverable state that wants a different next action
		// than a business that does not exist yet.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies({ business_locations: [] }),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		// The business is there…
		await expect(page.getByText(BUSINESS_NAME, { exact: true })).toBeVisible();
		// …the empty branch is scoped to LOCATIONS, not to the business…
		await expect(
			page.getByText(strings.business.noLocationsTitle, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.noBusiness, { exact: true }),
		).toHaveCount(0);
		// …and it offers the action that resolves it.
		await expect(
			page.getByText(strings.business.createLocation, { exact: true }),
		).toBeVisible();
	});

	test("the location list renders each branch with its own state", async ({
		page,
	}) => {
		// Two branches, one active and one inactive. `LocationCard` reads
		// `is_active` per row, and a panel that showed both as "Activa" would
		// tell the owner a closed branch is open — the kind of small wrong
		// number that costs a customer a wasted trip.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies({
				business_locations: [
					businessLocationFixture(),
					businessLocationFixture({
						id: "43434343-5454-6565-7676-878787878787",
						name: "Sucursal Coyoacán",
						address: "Av. Timurinode 41, Del Carmen",
						is_active: false,
						is_headquarter: false,
					}),
				],
			}),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		await expect(
			page.getByText("Sucursal Roma", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Sucursal Coyoacán", { exact: true }),
		).toBeVisible();
		// The addresses come from the row, not from a single business-level
		// address — the count is what proves each card got ITS OWN row.
		await expect(
			page.getByText("Av. Álvaro Obregón 220, Roma Norte", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Av. Timurinode 41, Del Carmen", { exact: true }),
		).toBeVisible();
		// Exactly one branch is live. `LocationCard` reads
		// `strings.business.active`/`inactive` — the LOCATION screen has its
		// own `locationActive`/`locationInactive` ("Activa"/"Inactiva", a
		// feminine form the card does not use), and the first draft of this
		// spec asserted those and failed against a correct app.
		await expect(
			page.getByText(strings.business.active, { exact: true }),
		).toHaveCount(1);
		await expect(
			page.getByText(strings.business.inactive, { exact: true }),
		).toHaveCount(1);
	});

	test("the Gestión tab is the highlighted one on this screen", async ({
		page,
	}) => {
		// A deep link lands on a screen whose tab the bar has to reflect. The
		// `<Tabs>` group has no `index` route, so a mismatch here is the
		// `fallbackTabName` path — and a panel that highlighted the wrong tab
		// would still pass every content assertion above.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
		});

		await page.goto("/management");
		await waitForBusinessShell(page);

		await expect(businessTab(page, strings.business.title)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(businessTablist(page)).toBeVisible();
	});
});
