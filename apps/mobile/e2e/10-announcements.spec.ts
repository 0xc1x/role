import type { Page } from "@playwright/test";
import { z } from "zod";

import { strings } from "../src/core/i18n/strings";
import { localDismissalKey } from "../src/features/announcements/domain/announcement";

import {
	TEST_USER_ID,
	acknowledgementFixture,
	announcementFixture,
	consumerTab,
	expect,
	stubSupabase,
	test,
	waitForConsumerShell,
	type StubOptions,
} from "./fixtures";

/**
 * ─── Why the operator's announcement queue is worth a browser spec ──────────
 *
 * The migration, the admin panel and the modal all have their own tests. What
 * none of them can see is the one claim the feature is actually made of:
 *
 * > a `required` announcement comes back on every launch until the person says
 * > they understood it.
 *
 * That claim lives BETWEEN four things that are each individually fine: a query
 * whose order the client does not control, a `Set` of ids the server owns, an
 * id list the device owns, and a `Modal` that is mounted from the root layout.
 * A unit test of `buildModalSequence` proves the grouping; a unit test of
 * `handleRequestClose` proves the gesture; neither can catch the wiring that
 * puts the required in the queue with nobody's acknowledgement in it, which is
 * the failure that loses an announcement forever. The table has no UPDATE and no
 * DELETE policy, so there is no undo.
 *
 * So this spec drives the real exported bundle against a real browser and reads
 * BOTH halves of every claim: what the screen shows, and what went over the
 * wire. The wire matters as much as the screen here, because the central rule
 * is about state that lives on the server — "it came back" is only proof if
 * nothing was written when it was closed.
 *
 * ─── Why the dummies in this world are unreachable, and how they are shaped ──
 *
 * The brief for this task said the seed rows would be inserted through the API
 * with an admin token, because `announcements` has no INSERT policy for
 * `authenticated`. That is true of the DATABASE and irrelevant here: this suite
 * does not talk to a database. It intercepts PostgREST at the browser edge
 * (`stubSupabase`), which is the same reason `fail` fails by name instead of
 * failing everything. A test that seeded rows over HTTP would be testing the
 * seed, and it would be unable to model the two states this feature is about:
 * "nobody acknowledged anything" and "this person already acknowledged it".
 */

/**
 * The dialog, found by the `aria-modal` its wrapper always carries.
 *
 * NOT `getByRole("dialog")`, and the reason is worth writing down because it
 * cost this file a whole red run: react-native-web's `Modal` sets `role="dialog"`
 * only once the modal is "active", and it becomes active from the fade
 * animation's `animationEnd` event (`ModalAnimation` → `onShow` →
 * `addActiveModal`). A CSS animation that a throttled or backgrounded page
 * never runs leaves the modal fully painted — title, badge, button and all —
 * with no role on it, so `getByRole("dialog")` times out on a screen that is
 * demonstrably correct. `aria-modal` is on the same node and is set
 * unconditionally, so it does not depend on an animation having run.
 *
 * Scoping every assertion to this node is what makes "the batch's second page is
 * showing" mean that INSTEAD OF "some text somewhere on the screen says 2 de 2".
 */
function dialog(page: Page) {
	return page.locator('[aria-modal="true"]');
}

/**
 * Waits until react-native-web considers the modal ACTIVE, which is the
 * precondition for the system back gesture.
 *
 * `Modal`'s `onRequestClose` — the Android hardware back button on native, the
 * Escape key on web — is wired inside `if (active && e.key === 'Escape')`, and
 * `active` is `isActive`, which only becomes true from the fade animation's
 * `animationEnd`. So a modal that is painted but still fading ignores Escape
 * entirely, and pressing it early is a race that fails about one run in three
 * on a screen that is correct.
 *
 * `role="dialog"` is set from the same flag (`ModalContent` renders
 * `role: active ? 'dialog' : null`), which makes it the honest signal to wait
 * on: "the modal is active" and "the modal carries the dialog role" are the
 * same fact in this library. That is why `dialog()` above does not use it — a
 * locator that flips halfway through a test is a flake — while this helper,
 * whose whole job is to wait for it, is the right place for it.
 */
async function waitForActiveModal(page: Page) {
	await expect(page.getByRole("dialog")).toBeVisible();
}

/** The primary button of the open dialog, by the copy it promises. */
function primaryButton(page: Page, label: string) {
	return dialog(page).getByRole("button", { name: label, exact: true });
}

/**
 * The batch's page counter, composed from the catalogue the way the dialog
 * composes it.
 *
 * Building it here instead of pasting "1 de 2" is the same rule the whole suite
 * follows: a literal goes stale the week someone renames the counter, and the
 * red test then teaches the next reader nothing about the product.
 */
function pageCounter(n: number, total: number) {
	return strings.announcements.pageCount
		.replace("{n}", String(n))
		.replace("{total}", String(total));
}

/**
 * A network world with a pending announcement queue.
 *
 * The acknowledgements read is a RULE and not a `bodies` entry, on purpose. The
 * endpoint serves two requests with opposite meanings — a GET that says "what
 * has this person already registered" and the upsert POST that registers one —
 * and a segment-keyed body answers both with the same rows. Splitting them by
 * method is what lets a spec assert the write it caused without the read
 * pre-loading the very row that write is supposed to create.
 *
 * It is also why the cold-start half of "it stops coming back once it is
 * understood" is a SEPARATE test (`acknowledged:` below) instead of a reload
 * in the middle of the write test: this stub answers from a fixed body and
 * cannot learn its own writes, so pretending otherwise would be asserting
 * against a fiction.
 */
function announcementWorld(
	announcements: ReturnType<typeof announcementFixture>[],
	{
		acknowledged = [],
		...overrides
	}: { acknowledged?: string[] } & Partial<StubOptions> = {},
): StubOptions {
	return {
		viewer: "consumer",
		rules: [
			{
				method: "GET",
				path: "announcement_acknowledgements",
				json: acknowledged.map(acknowledgementFixture),
			},
		],
		bodies: { announcements },
		...overrides,
	};
}

/**
 * The `info` ids this device has dismissed, read the way the repository reads
 * them: the audience-scoped key, and the same Zod check on the stored value.
 *
 * It exists to answer ONE question — "has the fire-and-forget write landed?" —
 * because `dismissInfo` updates the cache synchronously and writes to
 * AsyncStorage behind it, so a reload fired on the click would race the write
 * and read a device that had not dismissed anything yet.
 *
 * Reading the key rather than pasting it is the same call the fixtures make for
 * `onboardingSeenKey`: the audience is derived from the session's role inside
 * the repository, and a literal key would seed the wrong audience and turn a
 * broken spec into a mystery timeout.
 *
 * The browser half reads a raw string and the Node half parses it, because
 * `page.evaluate` serializes the callback: anything it closes over from the
 * test file's imports is simply not defined in the page, and the failure reads
 * `ReferenceError: _zod is not defined` from inside the browser.
 */
async function dismissedLocally(page: Page): Promise<string[] | null> {
	const raw = await page.evaluate(
		(key) => window.localStorage.getItem(key),
		localDismissalKey("user"),
	);
	if (raw === null) return null;
	const parsed = z.array(z.string()).safeParse(JSON.parse(raw));
	return parsed.success ? parsed.data : null;
}

/** Waits until the fire-and-forget local dismissal has reached the device. */
async function waitForDismissalCount(page: Page, count: number) {
	await expect
		.poll(async () => (await dismissedLocally(page))?.length ?? 0)
		.toBe(count);
}

/**
 * Waits until the boot's fetches have all come back.
 *
 * Used ONLY before a claim of absence ("no modal opens"). A `toHaveCount(0)`
 * passes the instant it is true, so asserting it while the announcement query
 * is still in flight proves nothing — the honest version of "it did not open"
 * needs the boot to have finished asking first. `networkidle` is the blunt but
 * truthful way to say that: no request in flight, so the query that would have
 * produced the modal has already been answered and rendered. It is not a sleep
 * with a longer name; a sleep would be exactly as arbitrary and slower.
 */
async function settle(page: Page) {
	await page.waitForLoadState("networkidle");
}

/**
 * TanStack Query's first retry backoff, in milliseconds.
 *
 * `defaultRetryDelay` in `@tanstack/query-core` is `min(1000 * 2^failureCount,
 * 30000)`, so a query with the client's global `retry: 1` asks again a full
 * second after the first failure. Any assertion that "this query was not
 * retried" has to be read AFTER that second, or it is only measuring how early
 * the assertion ran — which is exactly the kind of test that goes green on a
 * broken app, so this file pays the wait explicitly in the one place it needs
 * one and nowhere else.
 */
const FIRST_RETRY_BACKOFF_MS = 1_000;

test.describe("the operator announcement queue", () => {
	test("an active info opens a modal when the app starts", async ({ page }) => {
		// The positive control of this whole file, and the reason every negative
		// assertion below is worth anything: the SAME world minus one thing is
		// the one that shows a modal.
		const info = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000001",
			title: "Mantenimiento programado",
			severity: "info",
		});
		const supabase = await stubSupabase(page, announcementWorld([info]));

		await page.goto("/");

		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(info.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.infoBadge, { exact: true }),
		).toBeVisible();

		// The badge is not decoration: "Obligatorio" and "Novedad" are the only
		// thing telling the person whether they have to DO something. An `info`
		// wearing the required badge would be a lie about the queue's state.
		await expect(
			dialog(page).getByText(strings.announcements.requiredBadge, {
				exact: true,
			}),
		).toHaveCount(0);
		// And with it, the line that explains why an unacknowledged notice keeps
		// coming back. On an informative that sentence is a lie too.
		await expect(
			dialog(page).getByText(strings.announcements.requiredHint, {
				exact: true,
			}),
		).toHaveCount(0);

		// A single informative is a batch of one, so it is already on its last
		// page: the button says "discard", not "next". An `info` whose only button
		// says "Siguiente" would be a batch that cannot be left.
		await expect(
			primaryButton(page, strings.announcements.dismissBatch),
		).toBeVisible();
		await expect(
			primaryButton(page, strings.announcements.nextPage),
		).toHaveCount(0);
		// "1 de 1" would claim there is more behind this page.
		await expect(
			dialog(page).getByText(pageCounter(1, 1), { exact: true }),
		).toHaveCount(0);

		// The queue was read from the server, not invented by the client.
		expect(
			supabase.callsTo("GET", "/rest/v1/announcements").length,
			"the announcement queue was never asked for",
		).toBeGreaterThan(0);
	});

	test("a dismissed info does not come back on the next launch", async ({
		page,
	}) => {
		const info = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000002",
			title: "Horarios extendidos el viernes",
		});
		const supabase = await stubSupabase(page, announcementWorld([info]));

		await page.goto("/");
		await expect(dialog(page)).toBeVisible();
		await primaryButton(page, strings.announcements.dismissBatch).click();
		await expect(dialog(page)).toHaveCount(0);

		// The dismissal reached the device, under the audience's own key. Asserted
		// BEFORE the absence below on purpose: it is the positive signal that the
		// click was processed, and a claim of "nothing was written" taken before
		// anything observable happened is a claim about timing.
		await waitForDismissalCount(page, 1);
		expect(await dismissedLocally(page)).toEqual([info.id]);

		// An informative is NOT registered on the server: it has no row, it is an
		// id in the device's storage. A write here would mean the next person to
		// read this announcement — on another device, another account — inherited
		// somebody else's dismissal.
		expect(
			supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements"),
			"dismissing an informative must not write an acknowledgement",
		).toEqual([]);

		// The cold start. This is the half that matters: an in-memory dismissal
		// survives nothing, and an announcement that reappears on every launch is
		// the same bug as a required that never goes away.
		await page.reload();
		await settle(page);
		await waitForConsumerShell(page);

		// …and it was asked again, so "no modal" is the dismissal working and not
		// the queue simply not being read.
		expect(
			supabase.callsTo("GET", "/rest/v1/announcements").length,
			"the second launch never re-read the queue",
		).toBeGreaterThan(1);
		await expect(dialog(page)).toHaveCount(0);
	});

	test("a required comes back after being closed without being understood", async ({
		page,
	}) => {
		// THE rule of the feature. The whole reason `required` and `info` are
		// different severities is that one of them has an undo and the other does
		// not, and this is the test that would go red if someone ever wired the
		// "close" gesture to the acknowledgement.
		const required = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000003",
			title: "Actualizá tus datos de cobro",
			severity: "required",
			priority: 9,
		});
		const supabase = await stubSupabase(page, announcementWorld([required]));

		await page.goto("/");
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.requiredBadge, {
				exact: true,
			}),
		).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.requiredHint, {
				exact: true,
			}),
		).toBeVisible();

		// Escape is the `Modal`'s `onRequestClose` on web — react-native-web wires
		// the key to that prop, and on native the same prop is what the Android
		// hardware back button calls. It is the system gesture, not a button the
		// feature invented, which is why it is the honest way to close a required
		// without understanding it. `waitForActiveModal` first because the library
		// ignores the gesture until the fade is over.
		await waitForActiveModal(page);
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toHaveCount(0);

		// The load-bearing assertion, and it is on the WIRE rather than on the
		// screen: closing wrote nothing. `announcement_acknowledgements` has no
		// UPDATE and no DELETE policy, so one row written here is a required that
		// never appears again for this person, forever, and nothing in the app
		// could tell them.
		//
		// `settle` first so the absence is read after the boot's fetches are in and
		// the close gesture has had its turn — the same reason as everywhere else
		// in this file.
		await settle(page);
		expect(
			supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements"),
			"closing a required registered it as understood",
		).toEqual([]);

		// Nor did it leave a device-local dismissal: that store is for `info`,
		// and a required that a device remembered to hide would depend on a
		// browser's storage for a rule the server owns.
		expect(await dismissedLocally(page)).toBeNull();

		// It does not block the app, either. That is the second half of D7 and it
		// is only observable by actually navigating: a notice that traps the user
		// is a required that got its way.
		await consumerTab(page, strings.explore.title).click();
		await expect(page).toHaveURL(/\/explore$/);

		// The next launch. Navigating first is deliberate: the host is mounted
		// outside the navigation stack, so the notice has to come back on a
		// screen that is not the one it was first shown on.
		await page.reload();
		await settle(page);
		await expect(page).toHaveURL(/\/explore$/);
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(required.title, { exact: true }),
		).toBeVisible();

		// Still nothing written, now across two launches.
		expect(
			supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements"),
		).toEqual([]);
	});

	test("with both groups pending, the required one is the first modal", async ({
		page,
	}) => {
		// D10. The brief's version of this case (1 required + 2 info) does not
		// prove much on its own: with `priority` in play the required usually
		// arrives first anyway, so a grouping that ignored severity would still
		// open it. What is pinned here is that the SEVERITY decides, and the two
		// separate tests below ("a higher-priority info does not cover a required"
		// and "two required and two info open three modals") are the ones that
		// remove the coincidence.
		const required = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000004",
			title: "Leé los términos actualizados",
			severity: "required",
			priority: 8,
		});
		const first = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000005",
			title: "Ahora aceptamos pago con tarjeta",
		});
		const second = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000006",
			title: "Nuevos horarios de recogida",
		});
		await stubSupabase(page, announcementWorld([required, first, second]));

		await page.goto("/");

		await expect(
			dialog(page).getByText(required.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.requiredBadge, {
				exact: true,
			}),
		).toBeVisible();
		// The button is the fastest read of which severity is on screen: "Got it"
		// registers, "Close" discards, and crossing them is the bug this file
		// exists to keep out.
		await expect(
			primaryButton(page, strings.announcements.acknowledge),
		).toBeVisible();

		// The batch is behind the required, not inside it. Both of its notices are
		// in the queue — `one required + two info` is THREE modals, and this
		// screen is only the first of them.
		await expect(
			dialog(page).getByText(first.title, { exact: true }),
		).toHaveCount(0);
		await expect(
			dialog(page).getByText(second.title, { exact: true }),
		).toHaveCount(0);
	});

	test("clicking Entendido registers it for THIS person and closes the modal", async ({
		page,
	}) => {
		// The write half of "it stops coming back". The cold-start half is the next
		// test, and the split is not a convenience: `stubSupabase` answers from a
		// fixed body and cannot learn its own writes, so a reload here would
		// re-read an acknowledgements table that still says "nobody registered
		// anything" — a fiction this test would then be asserting against.
		const required = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000007",
			title: "Revisá tu método de pago",
			severity: "required",
		});
		const supabase = await stubSupabase(page, announcementWorld([required]));

		await page.goto("/");
		await expect(dialog(page)).toBeVisible();

		// Reading the notice changes nothing. If a row were written on mount, the
		// rule "it comes back until it is understood" would be satisfied by
		// opening the app, which is not understanding anything.
		expect(
			supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements"),
			"the queue registered something before the person did anything",
		).toEqual([]);

		await primaryButton(page, strings.announcements.acknowledge).click();

		// The row is keyed `(announcement_id, user_id)` and `user_id` has to be
		// the SESSION's, never one the caller supplies — that is what makes
		// "only acknowledge for yourself" a database restriction instead of a line
		// of code somebody can review away.
		//
		// Polled rather than read once, and the reason is the click: the write
		// only goes out after `getUser()`, so a single read right after the click
		// is a race with the network rather than an assertion. The claim being
		// ruled out is the real one — a dismissal routed into the acknowledgement
		// endpoint — and it cannot sneak in afterwards either, because nothing else
		// in this world writes.
		await expect
			.poll(() =>
				supabase
					.callsTo("POST", "/rest/v1/announcement_acknowledgements")
					.map((call) => call.body),
			)
			.toEqual([{ announcement_id: required.id, user_id: TEST_USER_ID }]);

		await expect(dialog(page)).toHaveCount(0);
	});

	test("a required the server already has on record does not come back", async ({
		page,
	}) => {
		// The cold-start half, with the premise stated instead of faked: the
		// acknowledgements table HAS this row, because the previous test wrote it.
		const required = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000008",
			title: "Verificá tu número de teléfono",
			severity: "required",
		});
		const supabase = await stubSupabase(
			page,
			announcementWorld([required], { acknowledged: [required.id] }),
		);

		await page.goto("/");
		await settle(page);
		await waitForConsumerShell(page);

		// The app asked the server about this person's acknowledgements. Without
		// the read, "it does not come back" would pass on an app that simply
		// never checked.
		expect(
			supabase.callsTo("GET", "/rest/v1/announcement_acknowledgements").length,
			"the queue never asked what this person had already registered",
		).toBeGreaterThan(0);

		// The announcement itself is STILL being offered — the row is active, in
		// its window, and the read policy lets it through. It is the
		// acknowledgement, not a disappearing announcement, that ends the queue.
		// That is the difference between "understood" and "expired".
		expect(
			supabase.callsTo("GET", "/rest/v1/announcements").length,
			"the queue was not even read, so nothing was resolved",
		).toBeGreaterThan(0);

		await expect(dialog(page)).toHaveCount(0);
	});

	test("two required and two info open THREE modals, not one", async ({
		page,
	}) => {
		// `conMax` counts OPEN MODALS, not announcements: five `info` are one
		// modal and three `required` are three. `buildModalSequence`'s type says
		// modals and its docblock says so twice, but a type comment cannot be
		// wrong in production — only an assertion notices.
		//
		// The brief's shape for this case (`1 required + 2 info`) cannot tell the
		// two counts apart, which is why this one is 2 and 2. And because the
		// layout paints only the head of the queue, the count is observed the only
		// way it can be: by walking THROUGH the gates.
		const requiredA = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000009",
			title: "Primer aviso obligatorio",
			severity: "required",
			priority: 10,
		});
		const requiredB = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000010",
			title: "Segundo aviso obligatorio",
			severity: "required",
			priority: 9,
		});
		const infoOne = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000011",
			title: "Primera novedad",
			priority: 5,
		});
		const infoTwo = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000012",
			title: "Segunda novedad",
			priority: 4,
		});
		const supabase = await stubSupabase(
			page,
			announcementWorld([requiredA, requiredB, infoOne, infoTwo]),
		);

		await page.goto("/");

		// Gate 1 of 3: the first required, alone. Its sibling is behind it.
		await expect(
			dialog(page).getByText(requiredA.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(requiredB.title, { exact: true }),
		).toHaveCount(0);
		await primaryButton(page, strings.announcements.acknowledge).click();

		// Gate 2 of 3: the second required. There is no pointer to advance — the
		// acknowledgement took the first one out of the queue and the next one
		// became the head — which is why there is nothing here that can desync.
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(requiredB.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.requiredBadge, {
				exact: true,
			}),
		).toBeVisible();
		await primaryButton(page, strings.announcements.acknowledge).click();

		// Gate 3 of 3: the batch, both notices in ONE modal. If the queue had
		// counted announcements, this would be two more gates and the counter
		// would not exist at all.
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.infoBadge, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(infoOne.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(pageCounter(1, 2), { exact: true }),
		).toBeVisible();
		await primaryButton(page, strings.announcements.nextPage).click();

		// Second page of the batch — still the third modal, not a fourth.
		await expect(
			dialog(page).getByText(infoTwo.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(pageCounter(2, 2), { exact: true }),
		).toBeVisible();
		await primaryButton(page, strings.announcements.dismissBatch).click();

		await expect(dialog(page)).toHaveCount(0);

		// Three gates, two writes, and the writes name the two requireds in the
		// order they were shown. An `info` has no acknowledgement at all — not a
		// third write, and not a write for the batch's first notice either.
		await expect
			.poll(() =>
				supabase
					.callsTo("POST", "/rest/v1/announcement_acknowledgements")
					.map((call) => call.body),
			)
			.toEqual([
				{ announcement_id: requiredA.id, user_id: TEST_USER_ID },
				{ announcement_id: requiredB.id, user_id: TEST_USER_ID },
			]);
		await waitForDismissalCount(page, 2);
	});

	test("dismissing the batch on its first page takes the whole batch with it", async ({
		page,
	}) => {
		// The concrete bug this callback's shape exists to prevent. `onDismissInfo`
		// takes `ids: string[]` and not `id: string` precisely so the batch cannot
		// be dismissed one notice at a time: dismissing only the page on screen
		// would leave the other two to come back on the next launch, and the one
		// that would NOT come back is the one the person actually read — which is
		// the exact opposite of the reasonable behaviour.
		//
		// The gesture has to be the SYSTEM one. On the last page the button says
		// "Close" and the question is trivial; on the first page the button says
		// "Next" and the only way out is the back gesture, which is where the
		// severity split lives.
		const infoOne = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000013",
			title: "BuscamosDelivery Partners",
			priority: 6,
		});
		const infoTwo = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000014",
			title: "Segundo aviso informativo",
			priority: 5,
		});
		const infoThree = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000015",
			title: "Tercer aviso informativo",
			priority: 4,
		});
		const supabase = await stubSupabase(
			page,
			announcementWorld([infoOne, infoTwo, infoThree]),
		);

		await page.goto("/");
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(pageCounter(1, 3), { exact: true }),
		).toBeVisible();

		// Gone from the first page, on a three-notice batch.
		await waitForActiveModal(page);
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toHaveCount(0);

		// ALL THREE, in one write. A dismissal carrying only the visible notice
		// would be indistinguishable from a working one on screen and would only
		// show up on the next launch.
		await waitForDismissalCount(page, 3);
		expect(await dismissedLocally(page)).toEqual([
			infoOne.id,
			infoTwo.id,
			infoThree.id,
		]);
		expect(
			supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements"),
		).toEqual([]);

		await page.reload();
		await settle(page);
		await waitForConsumerShell(page);
		expect(
			supabase.callsTo("GET", "/rest/v1/announcements").length,
			"the next launch never re-read the queue",
		).toBeGreaterThan(1);

		// Not one of the three came back — the two nobody read most of all.
		await expect(dialog(page)).toHaveCount(0);
	});

	test("an info with a higher priority does not cover a required", async ({
		page,
	}) => {
		// The part of D10 the previous "both groups" case cannot reach. The query
		// asks for `priority DESC, created_at DESC` and the server owns that
		// order — so an operator who gives a novelty `priority: 100` and a terms
		// update `priority: 1` gets the novelty FIRST, and only the severity
		// grouping keeps the mandatory one in front. Without it the user dismisses
		// a novelty and never sees the terms.
		const loudInfo = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000016",
			title: "Novedad con prioridad alta",
			severity: "info",
			priority: 100,
			created_at: "2026-10-02T12:00:00.000Z",
		});
		const quietRequired = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000017",
			title: "Aviso obligatorio de prioridad baja",
			severity: "required",
			priority: 1,
			created_at: "2026-10-01T12:00:00.000Z",
		});
		// Served in the order the ORDER BY would produce: highest priority first.
		const supabase = await stubSupabase(
			page,
			announcementWorld([loudInfo, quietRequired]),
		);

		await page.goto("/");

		// Pinned on the request, so "the server sent the info first" is a fact and
		// not an assumption about the stub's array. Polled rather than read once:
		// the query fires when the session resolves, which is after the navigation
		// has already committed, so a one-shot read here would be a race with the
		// boot rather than an assertion about the request.
		await expect
			.poll(() => supabase.callsTo("GET", "/rest/v1/announcements").length)
			.toBeGreaterThan(0);
		expect(
			supabase
				.callsTo("GET", "/rest/v1/announcements")
				.map((call) => call.search)
				.join(" | "),
		).toContain("order=priority.desc");

		await expect(
			dialog(page).getByText(quietRequired.title, { exact: true }),
		).toBeVisible();
		await expect(
			dialog(page).getByText(strings.announcements.requiredBadge, {
				exact: true,
			}),
		).toBeVisible();
		await expect(
			dialog(page).getByText(loudInfo.title, { exact: true }),
		).toHaveCount(0);
	});

	test("the app opens normally when the announcement query fails", async ({
		page,
	}) => {
		// D7, and the one case in this file with NO positive signal to lean on.
		// Every other test here would still pass on an app that renders a blank
		// page when this query fails, because they all assert on the queue. A
		// boot failure looks like a blank page from outside — which is exactly how
		// `01-boot.spec.ts`'s docblock describes the whole class — and this is the
		// only query in the app whose failure is allowed to happen.
		//
		// `fail` names `announcements` alone on purpose. Failing everything would
		// also break the config prefetch and the splash, and this spec would end
		// up measuring the 6-second splash watchdog instead of D7.
		const supabase = await stubSupabase(page, {
			viewer: "consumer",
			fail: {
				announcements: {
					code: "57014",
					message: "canceling statement due to statement timeout",
				},
			},
		});

		const bootErrors: string[] = [];
		page.on("pageerror", (error) => bootErrors.push(error.message));

		await page.goto("/");
		await waitForConsumerShell(page);

		// It reached a real screen, not the splash's escape hatch.
		await expect(consumerTab(page, strings.home.title)).toBeVisible();

		// And it is USABLE: a modal-free but unusable app would satisfy every
		// assertion above.
		await consumerTab(page, strings.explore.title).click();
		await expect(page).toHaveURL(/\/explore$/);
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);

		// Exactly one attempt. `retry: false` is a product decision and not a
		// default: the global client retries once, and a deferred retry here is a
		// required notice popping back into someone's face later with nobody
		// having asked for it.
		//
		// The wait is the point of the assertion. A retry is not "the query failed
		// again a moment later", it is "the query failed and then asked again a
		// full second later", so a count read straight after the failure is one
		// and would stay one on an app that does retry. Past the backoff, it is
		// one only if nothing asked again.
		await page.waitForTimeout(FIRST_RETRY_BACKOFF_MS + 500);
		expect(
			supabase.callsTo("GET", "/rest/v1/announcements").length,
			"the failed announcement query was retried, so a required could appear on its own",
		).toBe(1);

		// The failure reached the app — otherwise the assertion above is vacuous —
		// and it stayed inside the query instead of climbing the tree.
		expect(
			bootErrors,
			`the failed announcement query threw out of the tree: ${bootErrors.join(" | ")}`,
		).toEqual([]);
	});

	test("a failed acknowledgement leaves the required on screen with a reason", async ({
		page,
	}) => {
		// The mirror of the rule, and the guard on the change someone would make
		// trying to make the modal feel snappier: take the required out of the
		// queue optimistically, before the server confirms. With no UPDATE and no
		// DELETE on `announcement_acknowledgements`, an optimistic removal that
		// the write then fails to justify is an announcement that is gone from the
		// screen and still pending forever.
		//
		// The write is failed by a `rule` rather than by `fail`, because `fail` is
		// keyed on the last path segment and this endpoint's GET is what decides
		// whether the required shows at all. Failing the segment would leave an
		// empty queue and prove nothing about the click.
		const required = announcementFixture({
			id: "d0a00000-0000-4000-8000-000000000018",
			title: "Confirma tu correo electrónico",
			severity: "required",
		});
		const driverMessage =
			"permission denied for table announcement_acknowledgements";
		const supabase = await stubSupabase(page, {
			...announcementWorld([required]),
			rules: [
				{ method: "GET", path: "announcement_acknowledgements", json: [] },
				{
					method: "POST",
					path: "announcement_acknowledgements",
					status: 400,
					json: { code: "42501", message: driverMessage, details: null },
				},
			],
		});

		await page.goto("/");
		await expect(dialog(page)).toBeVisible();
		await primaryButton(page, strings.announcements.acknowledge).click();

		// Still here, still saying the same thing: the person did not understand
		// it, they pressed a button, and the button did not work.
		await expect(dialog(page)).toBeVisible();
		await expect(
			dialog(page).getByText(required.title, { exact: true }),
		).toBeVisible();

		// With a reason attached, announced as an alert rather than swallowed. A
		// notice that silently failed to save teaches the user the app is broken,
		// and they would read the terms and then have to read them again.
		await expect(dialog(page).getByRole("alert")).toBeVisible();

		// The driver's English never reaches the screen: it names the table and
		// the constraint. Asserted as an absence because that is the claim.
		await expect(
			dialog(page).getByText(driverMessage, { exact: false }),
		).toHaveCount(0);

		// The button came back, so the retry the reason promises is possible.
		await expect(
			primaryButton(page, strings.announcements.acknowledge),
		).toBeEnabled();
		await expect
			.poll(
				() =>
					supabase.callsTo("POST", "/rest/v1/announcement_acknowledgements")
						.length,
			)
			.toBe(1);
	});
});
