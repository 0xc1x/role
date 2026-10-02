import { expect, test } from "@playwright/test";

import { signIn, stubApi } from "./support/admin";

/**
 * `/notificaciones/mails` — the four-tab email workspace.
 *
 * ─── Why this section needed its own file ───────────────────────────────────
 *
 * It is the only section in the panel that is not a list page. It is four
 * INDEPENDENT surfaces behind one heading, and only one of them ever mounted:
 * `MAIL_TABS` are `enviar`, `plantillas`, `componentes` and `envios`, each
 * rendered inside its own `TabPanel`, and the tab lives in the URL so a reload
 * returns the operator to the same place.
 *
 * That shape hides failures in a way a list section cannot. A tab that throws
 * takes only itself down, the heading stays, the other tabs keep working, and
 * the page looks fine. A suite that asserted "the Mails page rendered" would
 * pass with three of the four tabs broken — which is exactly what the first
 * draft of this file would have done.
 *
 * ─── The defect this file found ─────────────────────────────────────────────
 *
 * `TemplatesTab` and `ComponentsTab` had no `isError` branch at all. Measured:
 * with the API in 500 they rendered their heading and their create button and
 * nothing else — no row, no message, no retry. An operator looking at an
 * emptied template list concludes the platform has no templates, and starts
 * recreating them. The error tests below are what would have caught it.
 */

/**
 * One entry per tab, so each tab is proven on ITS OWN surface.
 *
 * The three tabs do not render the same KIND of thing, and that is the reason
 * this needs a per-tab descriptor rather than one shared assertion:
 *
 *   - `plantillas` and `componentes` render a row per item, and the row text is
 *     the fixture's own — the only field that distinguishes a template from a
 *     component on a page that shows both.
 *   - `envios` renders a table of send LOGS, and the list is stubbed empty on
 *     purpose: the `EmailSendDto` is 25 nullable audit columns wide, and
 *     inventing one to fill a table whose columns are not this file's subject
 *     would be a fixture maintained for nobody and read by nobody. What that
 *     tab IS for is filtering a log, so the claim is its own filter control.
 *
 * `control` is a placeholder rather than text in every case because that is the
 * accessible handle a screen reader reads, and a tab that fell through to
 * another tab's content has none of them.
 */
const TABS = [
	{
		tab: "plantillas",
		label: "Plantillas",
		// This tab's own heading, NOT the page's "Mails". `PageTabs` renders every
		// label at once and `MailsPage` always renders the page heading, so a
		// page-level assert is satisfied by the shell. The tab's `<h2>` only exists
		// when its panel is the mounted one, which makes it the cheapest proof
		// that the right tab is showing.
		heading: "Plantillas",
		endpoint: "/email-marketing/templates",
		// The template's own subject: the only field that distinguishes a template
		// row from a component row on a page that shows both.
		row: "Bienvenido a Rolé",
	},
	{
		tab: "componentes",
		label: "Componentes",
		// The components tab does NOT say "Componentes" — it says "Encabezados y
		// pies". Asserting the label would have failed against a correct panel,
		// and the mismatch is the finding: the tab label and its heading are two
		// different vocabularies for the same surface.
		heading: "Encabezados y pies",
		endpoint: "/email-marketing/components",
		row: "Pie E2E",
	},
	{
		tab: "envios",
		label: "Envíos",
		// This tab has no `<h2>` of its own: `EnviosTab` opens straight into its
		// filter row. Its filter is the claim — see the note on the sends fixture.
		heading: null,
		control: "Buscar email...",
		endpoint: "/email-marketing/sends",
		row: null,
	},
] as const;

test.describe("mails workspace", () => {
	/**
	 * Each tab renders ITS OWN data, from ITS OWN endpoint.
	 *
	 * Generated from the table so a fourth tab cannot be added without a fourth
	 * case — the failure mode this file exists to prevent is a tab that renders
	 * because the heading is there, and a per-tab fixture row is the only
	 * assertion that survives the heading being there on its own.
	 */
	for (const tab of TABS) {
		test(`the ${tab.label} tab renders its own list`, async ({ page }) => {
			await stubApi(page);
			await signIn(page);
			// Straight to the tab in the URL, which is also the reload case: the
			// tab has to survive being linked to, not only being clicked.
			await page.goto(`/notificaciones/mails?tab=${tab.tab}`);

			// The tab's own content, never the page's. A heading is used where the
			// tab has one, and a placeholder where it does not — both are handles
			// that exist only while that panel is mounted, so neither can be
			// satisfied by the shell around it.
			if (tab.heading) {
				await expect(
					page.getByRole("heading", { name: tab.heading, exact: true }),
				).toBeVisible({ timeout: 20_000 });
			} else {
				await expect(
					page.getByPlaceholder(tab.control, { exact: true }),
				).toBeVisible({ timeout: 20_000 });
			}

			// The fixture row, when this tab has one: a tab that mounted the right
			// heading while rendering the wrong list is a failure an assert on
			// structure alone cannot see.
			if (tab.row) {
				await expect(page.getByText(tab.row, { exact: false })).toBeVisible();
			}

			// The tab is the ACTIVE one, not merely present: `PageTabs` renders
			// every label at once, so a page that ignored `?tab=` would show all
			// four and satisfy the asserts above with the wrong one's content.
			await expect(
				page.getByRole("tab", { name: tab.label, selected: true }),
			).toBeVisible();
		});
	}

	/**
	 * Switching tabs is a client-side navigation that must not lose the session.
	 *
	 * Worth its own test because it is the only way to reach a tab WITHOUT a
	 * full page load, and the full load re-runs `beforeLoad` with a fresh router.
	 * A tab panel that only works on a cold navigation is a tab that appears
	 * broken to anyone who clicks through the panel normally.
	 */
	test("moving between tabs keeps the session and the workspace mounted", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/notificaciones/mails");

		await expect(page.getByRole("heading", { name: "Mails" })).toBeVisible({
			timeout: 20_000,
		});

		await page.getByRole("tab", { name: "Plantillas" }).click();
		await expect(page).toHaveURL(/tab=plantillas/);
		await expect(page.getByText("Bienvenido a Rolé")).toBeVisible();

		await page.getByRole("tab", { name: "Componentes" }).click();
		await expect(page).toHaveURL(/tab=componentes/);
		await expect(page.getByText("Pie E2E")).toBeVisible();

		// The previous tab is no longer VISIBLE. NOT unmounted: `TabPanel` hides
		// inactive panels with the `hidden` attribute on purpose, so the
		// `aria-controls` of every tab always resolves to a real panel and an
		// operator does not lose what they typed in another tab. The first draft
		// asserted `toHaveCount(0)` and failed against that deliberate decision —
		// the claim worth pinning is what the operator can SEE, which is also the
		// only thing `hidden` is there to guarantee.
		await expect(page.getByText("Bienvenido a Rolé")).toBeHidden();

		// Still signed in: the gate never intervened.
		await expect(page.getByText("admin@role.test")).toBeVisible();
	});

	/**
	 * The default tab is `enviar`, and the URL has to say so when it does not.
	 *
	 * `setTab` navigates with `{}` for the default rather than `{ tab: "enviar" }`,
	 * so the default tab is the one with NO parameter in the URL. Asserting that
	 * keeps a refactor from writing `?tab=enviar` everywhere, which would make
	 * every shareable link carry a redundant value.
	 */
	test("the default tab needs no URL parameter", async ({ page }) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/notificaciones/mails");

		await expect(
			page.getByRole("tab", { name: "Enviar", selected: true }),
		).toBeVisible({ timeout: 20_000 });
		await expect(page).not.toHaveURL(/tab=/);
	});
});

/**
 * A failed tab.
 *
 * The same three claims as every other error test in this suite — the message,
 * a retry, and the absence of a row — applied to a surface that renders inside
 * a tab. The last one matters most here: `TemplatesTab` and `ComponentsTab` had
 * no error branch, so a 500 produced an empty tab, and an operator reading an
 * empty template list concludes the platform has no templates.
 */
test.describe("failed tabs", () => {
	for (const tab of TABS) {
		test(`the ${tab.label} tab shows the failure instead of an empty list`, async ({
			page,
		}) => {
			await stubApi(page, {
				[tab.endpoint]: { status: 500, body: { message: "Boom" } },
			});
			await signIn(page);
			await page.goto(`/notificaciones/mails?tab=${tab.tab}`);

			await expect(
				page.getByRole("button", { name: "Reintentar" }),
				`the ${tab.label} tab turned an API failure into an empty list`,
			).toBeVisible({ timeout: 20_000 });

			await expect(page.getByText("Boom")).toBeVisible();

			// The error is INSIDE this tab, and the tab is still the selected one.
			// Asserting "Boom" alone would pass on a page that had put the error on
			// a different tab, which is the bug a tabbed workspace hides best: the
			// operator would blame the wrong surface and go fix the wrong thing.
			await expect(
				page.getByRole("tab", { name: tab.label, selected: true }),
			).toBeVisible();

			// The rest of the panel survives, and so does the workspace: a tab
			// failure taking down the page would hide the other tabs, which are
			// exactly what an operator would switch to in order to work around it.
			//
			// `PageTabs` is OUTSIDE `TabPanel`, so this is the assertion that the
			// error branch stayed inside its own tab. Asserting the sidebar alone
			// would pass even if the tabs had gone with it.
			await expect(page.getByText("admin@role.test")).toBeVisible();
			await expect(page.getByRole("tab", { name: "Enviar" })).toBeVisible();
			await expect(page.getByRole("tab", { name: "Plantillas" })).toBeVisible();

			// And no row, so the failure is never dressed as an empty result. On
			// the list tabs that is a fixture value; on the filters tab it is the
			// tab's own control, which `EnviosTab` renders BELOW its error branch —
			// so its absence is what proves the error branch was taken rather than
			// skipped.
			if (tab.row) {
				await expect(page.getByText(tab.row, { exact: false })).toHaveCount(0);
			} else {
				await expect(
					page.getByPlaceholder(tab.control, { exact: true }),
				).toHaveCount(0);
			}
		});
	}
});
