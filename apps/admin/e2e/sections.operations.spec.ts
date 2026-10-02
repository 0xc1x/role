import { expect, test } from "@playwright/test";

import { type ApiOverride, signIn, stubApi } from "./support/admin";

/**
 * The operations surface: settings, tips, the contact inbox and campaigns.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * The commerce catalogue in `sections.catalogue.spec.ts` shares one shape with
 * the rest of the panel: a `DataTable` driven by a list query. These sections
 * do not. The contact inbox short-circuits before its table when the list is
 * empty; the campaign pages are card lists with no pagination at all; the
 * settings grid is a key/value table where the KEY is the identity. A suite
 * that assumed one uniform "row + heading" shape would either pass vacuously
 * here or force the assertions to be weakened to fit — which is the failure
 * mode this file is written against.
 *
 * ─── The shared defect class these sections still had ───────────────────────
 *
 * Five of the surfaces below (plantillas, componentes, campañas de email,
 * campañas push, segmentos) had NO `isError` branch at all. Measured: with the
 * API in 500, `/campanas/segmentos` rendered its heading and its "crear" button
 * and nothing else — no card, no message, no retry. The operator saw a module
 * that looked empty, which is a fact about the catalog they would act on. That
 * is the same class the panel's own `errors.spec.ts` calls the most dangerous
 * regression, and the error tests here are the ones that would have caught it.
 */

type Section = {
	path: string;
	heading: string;
	/** Text unique to this section's fixture row. */
	row: string;
	/** A second, independent value from the SAME row. */
	detail: string;
	/**
	 * Some fixture text is repeated in an `sr-only` control label (the edit
	 * drawers all name their target), which makes a page-level `getByText`
	 * ambiguous. Address the cell instead.
	 */
	rowInCell?: boolean;
	/**
	 * The campaign and segment pages are CARD lists, not tables: there is no
	 * `<tr>` to scope to, and the first draft's `getByRole("row")` filter found
	 * nothing on all three. Scoping to the card's own container is the only way
	 * `detail` can mean "this row" rather than "somewhere on the page".
	 */
	isCard?: boolean;
	/**
	 * `detail` is an `aria-label`, not visible text, so it has to be asserted as
	 * a role+name. Set for the tips table, whose `Estado` column renders a
	 * `Switch` with no text of its own.
	 */
	detailIsAccessibleName?: boolean;
};

const OPERATIONS: Section[] = [
	{
		path: "/configuracion",
		heading: "Configuración de la plataforma",
		// The KEY is the identity in a settings grid, and `value` is rendered
		// through `String(...)` — so a value arriving as a number instead of a
		// string would render identically here and differently in every consumer.
		// `key` and `label` are the pair that proves the row is a real setting
		// rather than a stray pair of strings.
		row: "support.email",
		rowInCell: true,
		detail: "ayuda@role.test",
	},
	{
		path: "/consejos",
		heading: "Panel de Consejos",
		// A tip's entire payload is `{ content, active }`, so the body IS the
		// row. Asserting the full sentence matters because the cell is
		// `line-clamp-2` — a prefix would pass against a cell that clipped.
		row: "Guarda tu pan en una bolsa de tela para que respire.",
		// NOT "Activo": the `Estado` column renders a `Switch` with
		// `aria-label="Consejo activa"`, not a text badge. The first draft
		// asserted the word and failed against a correct panel. The switch's
		// accessible name is the claim that actually holds, and it is what a
		// screen reader reads out, so it is what is worth pinning — along with
		// its CHECKED state, since a tip rendered inactive by a lost `active`
		// field would look identical in the markup.
		detail: "Consejo activa",
		detailIsAccessibleName: true,
	},
	{
		path: "/contactos",
		heading: "Contactos",
		row: "Carla Contacto",
		detail: "Quito",
	},
	{
		path: "/reportes",
		heading: "Reportes",
		row: "La app se cierra al confirmar el pago",
		// "Abierto" is the TRIAGE label, and the assertion that matters is the one
		// in the dedicated test below: the enum token `ABIERTO` must never reach
		// the screen. Here the second value just proves the triage badge rendered
		// the fixture's own `state`.
		detail: "Abierto",
	},
	{
		path: "/campanas/mails",
		heading: "Campañas de Marketing",
		// Channel is the discriminator between this page and the push one: both
		// read the SAME endpoint with a different `?channel=`, so a fixture that
		// ignored the param would render one campaign on both pages and the
		// filter would be untestable. The name carries the channel.
		row: "Campaña email E2E",
		// `0/0 enviados` — the card's own line. A `?? 0` that fired while
		// `total_recipients` was present would still print `0`, so this proves
		// the counters reached the card.
		detail: "0/0 enviados",
		isCard: true,
	},
	{
		path: "/campanas/push",
		heading: "Campañas Push",
		row: "Campaña push E2E",
		// NOT the mail card's `0/0 enviados`: the two cards format their counters
		// differently (`push-campaign-row-card.tsx:42` spells them out, the mail
		// card compacts them). Asserting the mail string here would have pinned
		// the wrong component, and it is a real distinction — a refactor unifying
		// the two is a copy change a test should notice.
		detail: "0 destinatarios · 0 enviados · 0 fallidos",
		isCard: true,
	},
	{
		path: "/campanas/segmentos",
		heading: "Segmentos",
		// `estimated_count` is the number in "~N destinatarios". A `null` renders
		// the literal "~?", so asserting the count is what distinguishes a real
		// audience size from a fallback the panel invented.
		row: "Personas de Quito",
		detail: "~42 destinatarios",
		isCard: true,
	},
];

test.describe("operations sections", () => {
	for (const section of OPERATIONS) {
		test(`${section.heading} renders the values the API sent`, async ({
			page,
		}) => {
			await stubApi(page);
			await signIn(page);
			await page.goto(section.path);

			const rowCell = section.rowInCell
				? page.getByRole("cell", { name: section.row, exact: true })
				: page.getByText(section.row, { exact: false });

			await expect(rowCell).toBeVisible({ timeout: 20_000 });
			await expect(
				page.getByRole("heading", { name: section.heading, exact: true }),
			).toBeVisible();

			// Scoped to the row, so `detail` cannot be satisfied by page chrome or
			// by a different row of the same table. Cards get the same treatment
			// through the card container, since they are not `<tr>`s.
			const row = section.isCard
				? page.locator("div.rounded-lg.border").filter({ hasText: section.row })
				: page.getByRole("row").filter({ hasText: section.row });
			if (!section.detailIsAccessibleName) {
				await expect(row).toContainText(section.detail);
			}

			// An `aria-label` is not text, so a `toContainText` on it can never
			// pass — the switch's accessible NAME is the claim, and it has to be
			// asserted as a role+name the way a screen reader would read it. Only
			// the tips table needs this: its `Estado` column is a `Switch` rather
			// than a text badge.
			if (section.detailIsAccessibleName) {
				await expect(
					page.getByRole("switch", { name: section.detail }),
				).toBeChecked();
			}
		});
	}

	/**
	 * A campaign card's actions depend on its status, and the status is a token.
	 *
	 * `CampaignRowCard` branches the whole action set on `c.status`: a `draft`
	 * offers "send" and "edit", a `sent` one offers "resend", and a `cancelled`
	 * one offers neither. That branch is a real decision an operator makes on, so
	 * this asserts the draft's own action is present AND the sent-only one is
	 * absent — which is the pair a status regression actually breaks. Asserting
	 * only that a card rendered would survive every one of those mistakes.
	 *
	 * The badge itself still prints the raw token, which is why the status is
	 * pinned by BEHAVIOUR here rather than by its label.
	 */
	test("a draft campaign offers the actions a sent one may not", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/campanas/mails");
		await expect(page.getByText("Campaña email E2E")).toBeVisible({
			timeout: 20_000,
		});

		// Draft: sending and editing are on offer.
		await expect(
			page.getByRole("button", { name: "Enviar" }).first(),
		).toBeVisible();

		// Sent-only. A card that offered it for a draft would let an operator
		// double-send a campaign that has never left the building.
		await expect(page.getByRole("button", { name: "Reenviar" })).toHaveCount(0);
	});

	/**
	 * The contact inbox's status column is a legend waiting to be misread.
	 *
	 * The enum is `PENDIENTE` / `PROCESADO` / `ERROR`, and the panel warns in
	 * prose that `PENDIENTE` means the NOTICE email has not been delivered — not
	 * that nobody has read the message. An operator who reads it as "unread"
	 * triages the wrong queue. The route states the rule, and the column renders
	 * the state; both are asserted because a label without the legend, or a
	 * legend without the column, each mislead half the time.
	 */
	test("the contact inbox states what its status column does not mean", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/contactos");

		await expect(page.getByText("Carla Contacto")).toBeVisible({
			timeout: 20_000,
		});

		// The legend. Its whole content is the disambiguation, so a paraphrase
		// would be a different test.
		await expect(
			page.getByText("no que el mensaje esté sin leer"),
		).toBeVisible();

		// The column, on the fixture's own row, carrying the TRANSLATED label.
		// `PENDIENTE` reaching the screen verbatim is the regression: the enum
		// token says nothing about what is pending, and the whole point of
		// `CONTACT_DELIVERY_STATUS_LABELS` is that the operator is told it is the
		// notice email and not the message.
		const row = page.getByRole("row").filter({ hasText: "Carla Contacto" });
		await expect(row).toContainText("Entrega pendiente");
		await expect(row).not.toContainText("PENDIENTE");
	});

	/**
	 * The bug report inbox's only column is TRIAGE, and it is not the contact
	 * inbox's column under a different name.
	 *
	 * `delivery_status` says "the notice email has not been delivered" in the
	 * contact inbox, where a mail path exists to deliver it. A bug report has no
	 * mail path at all, so nothing ever moves that field after the insert: a
	 * borrowed badge would be a permanent "Entrega pendiente" that the operator
	 * triages as outstanding work, forever, for every row. So the assertion here
	 * is an ABSENCE, and it is the strongest one the fixture can carry: the
	 * fixture sends `PENDIENTE` (the exact state the contact inbox's badge would
	 * paint), so a panel that had copied the column would show it.
	 */
	test("the bug report inbox shows triage and no delivery status at all", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);
		await page.goto("/reportes");

		await expect(
			page.getByText("La app se cierra al confirmar el pago"),
		).toBeVisible({ timeout: 20_000 });

		const row = page
			.getByRole("row")
			.filter({ hasText: "La app se cierra al confirmar el pago" });

		// The triage badge, translated: `ABIERTO` verbatim would say nothing about
		// what is open, and the whole point of the column is that the operator
		// reads it without knowing the vocabulary.
		await expect(row).toContainText("Abierto");
		await expect(row).not.toContainText("ABIERTO");

		// The origin, translated too. And no delivery badge, in any of its
		// wordings: this is the assertion that would break first if someone
		// "just reused the contact inbox column set".
		await expect(row).toContainText("Android");
		await expect(row).not.toContainText("Entrega pendiente");
		await expect(row).not.toContainText("Notificado");
		await expect(row).not.toContainText("PENDIENTE");

		// And the page says why, in prose: a column that needs explaining needs
		// the explanation on screen, not only in a commit message.
		await expect(
			page.getByText("no se manda ningún aviso", { exact: false }),
		).toBeVisible();
	});
});

/**
 * The empty list, per section.
 *
 * The empty copy is PER SECTION and two of these do not use `DataTable`'s at
 * all: the contact inbox and the segment list short-circuit before their table,
 * because "nothing matches this filter" and "there is nothing" are different
 * facts for a moderation surface. A single shared string would have passed by
 * luck on the tables and failed on the two that matter most.
 */
test.describe("empty lists", () => {
	const EMPTY: Array<{
		path: string;
		heading: string;
		endpoint: string;
		emptyCopy: string;
		/**
		 * Other endpoints that must ALSO come back empty for this page to reach
		 * its empty state. Needed where the render is gated on more than the
		 * list, and the reason is worth carrying here: a page blocked on a
		 * second query looks identical to a page blocked on a slow one.
		 */
		alsoEmpty?: string[];
	}> = [
		{
			path: "/configuracion",
			heading: "Configuración de la plataforma",
			endpoint: "/app-config",
			emptyCopy: "No hay datos",
		},
		{
			path: "/consejos",
			heading: "Panel de Consejos",
			endpoint: "/tips/admin",
			emptyCopy: "No hay datos",
		},
		{
			path: "/contactos",
			heading: "Contactos",
			endpoint: "/contact-inbox",
			// Not `DataTable`'s: the inbox short-circuits before the table,
			// because "nothing matches this filter" and "there is nothing" are
			// different facts for a moderation surface.
			emptyCopy: "No hay mensajes de contacto con este filtro.",
		},
		{
			path: "/reportes",
			heading: "Reportes",
			endpoint: "/bug-report-inbox",
			// Same short-circuit as the contact inbox, and for the same reason: a
			// triage surface where "nothing matches this filter" and "there is
			// nothing" are different facts.
			emptyCopy: "No hay reportes de error con este filtro.",
		},
		{
			path: "/campanas/mails",
			heading: "Campañas de Marketing",
			endpoint: "/email-marketing/campaigns",
			// The create button, because a card list with no cards has no empty
			// copy of its own. What is being asserted is that the page still
			// offers its way out, not that it apologises.
			emptyCopy: "Crear campaña",
		},
		{
			path: "/campanas/push",
			heading: "Campañas Push",
			endpoint: "/email-marketing/campaigns",
			emptyCopy: "Crear campaña",
			// This page blocks on TWO queries, and the second is not the list:
			// `if (list.isLoading || templates.isLoading) return <Loading />`.
			// Emptying only the campaigns left `usePushTemplates()` on its
			// skeleton, so the first draft never saw the page at all.
			alsoEmpty: ["/push-notifications/templates"],
		},
		{
			path: "/campanas/segmentos",
			heading: "Segmentos",
			endpoint: "/email-marketing/segments",
			// Same as the campaign pages: no sentence, just the create button.
			emptyCopy: "Crear segmento",
		},
	];

	for (const section of EMPTY) {
		test(`${section.heading} is empty without rendering a blank page`, async ({
			page,
		}) => {
			const emptyBody = {
				data: [],
				meta: { page: 1, limit: 10, total: 0, total_pages: 1 },
			};
			await stubApi(page, {
				[section.endpoint]: { status: 200, body: emptyBody },
				...(section.alsoEmpty ?? []).reduce<ApiOverride>((acc, endpoint) => {
					acc[endpoint] = { status: 200, body: emptyBody };
					return acc;
				}, {}),
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
 * The failed list, per section.
 *
 * The three assertions are the same everywhere and each is independently
 * satisfiable by a broken screen: the API's message, a retry control, and the
 * ABSENCE of the row. The last one is what separates an error from a
 * successful empty result, and it is the one a smoke assert never checks.
 *
 * The 20 s budget is React Query's backoff, not padding — no list query in the
 * panel sets `retry`, so the error branch renders only after ~1 s + 2 s + 4 s.
 */
test.describe("failed lists", () => {
	const FAILING: Array<{
		path: string;
		endpoint: string;
		row: string;
		/**
		 * Endpoints that must ALSO fail. Same reason as `alsoEmpty` above: a
		 * render gated on a second query never reaches the error branch if that
		 * second query is still loading, and a spec that only breaks the list
		 * would then pass against a page that is merely stuck.
		 */
		alsoFail?: string[];
	}> = [
		{
			path: "/configuracion",
			endpoint: "/app-config",
			row: "support.email",
		},
		{ path: "/consejos", endpoint: "/tips/admin", row: "bolsa de tela" },
		{ path: "/contactos", endpoint: "/contact-inbox", row: "Carla Contacto" },
		{
			path: "/reportes",
			endpoint: "/bug-report-inbox",
			row: "La app se cierra al confirmar el pago",
		},
		{
			path: "/campanas/mails",
			endpoint: "/email-marketing/campaigns",
			row: "Campaña email E2E",
		},
		{
			path: "/campanas/push",
			endpoint: "/email-marketing/campaigns",
			row: "Campaña push E2E",
		},
		{
			path: "/campanas/segmentos",
			endpoint: "/email-marketing/segments",
			row: "Personas de Quito",
		},
	];

	for (const section of FAILING) {
		test(`${section.path} shows the failure and a retry instead of an empty list`, async ({
			page,
		}) => {
			const failure = { status: 500, body: { message: "Boom" } };
			await stubApi(page, {
				[section.endpoint]: failure,
				...(section.alsoFail ?? []).reduce<ApiOverride>((acc, endpoint) => {
					acc[endpoint] = failure;
					return acc;
				}, {}),
			});
			await signIn(page);
			await page.goto(section.path);

			await expect(
				page.getByRole("button", { name: "Reintentar" }),
				`${section.path} turned an API failure into an empty list`,
			).toBeVisible({ timeout: 20_000 });

			await expect(page.getByText("Boom")).toBeVisible();

			// The rest of the panel survives — the regression the loader removal
			// fixed, asserted per section because one route reintroducing a
			// `loader` would bring back the full-page error for that section only.
			await expect(page.getByText("admin@role.test")).toBeVisible();

			// And no row, so a failure is never dressed as an empty result.
			await expect(page.getByText(section.row)).toHaveCount(0);
		});
	}
});
