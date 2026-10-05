import {
	type APIRequestContext,
	expect,
	type Page,
	test as base,
} from "@playwright/test";

/**
 * The production backend, spelled out.
 *
 * `apps/landing/.env` ships `VITE_API_URL=https://role-0hjz.onrender.com/api/v1`.
 * It is a live deployment, so the suite treats reaching it as a defect rather
 * than as a slow dependency: the dev server this suite starts is pinned to a
 * loopback stub, and this fixture is the second, independent lock. If the env
 * override ever stops winning, the browser still cannot get there.
 */
export const PRODUCTION_API_HOST = "role-0hjz.onrender.com";

/** Where the suite's own stub lives; every allowed API call must target this. */
export const STUB_API_ORIGIN = "http://127.0.0.1:3999";

/**
 * The stub's own control plane, OUTSIDE `/api/v1`.
 *
 * It changes what the loopback stub answers for `/announcements` and nothing
 * else: no write, no forward, and unreachable from anything but loopback. The
 * `announcements` mode is stateful — the stub process outlives a single test —
 * so the default below is the safe one and the specs restore it.
 */
export const STUB_CONTROL_PATH = "/__stub/announcements";

export type AnnouncementsMode = "caido" | "hostil" | "benigno";

/** The mode the suite leaves behind: the failing API, which is the safe one. */
export const ANNOUNCEMENTS_DEFAULT_MODE: AnnouncementsMode = "caido";

export async function setAnnouncementsMode(
	request: APIRequestContext,
	mode: AnnouncementsMode,
): Promise<void> {
	const response = await request.post(`${STUB_API_ORIGIN}${STUB_CONTROL_PATH}`, {
		data: { mode },
	});
	if (!response.ok()) {
		throw new Error(
			`el stub no aceptó el modo ${mode}: ${response.status()} ${await response.text()}`,
		);
	}
}

/** The landing's only write endpoint. */
export const ONBOARDING_PATH = "/businesses/onboarding";

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/;

export interface NetworkLog {
	/** Every request the browser attempted, in order. */
	all: string[];
	/** Attempts against the production backend. Must always stay empty. */
	production: string[];
	/** Attempts against any host that is neither loopback nor the dev server. */
	offOrigin: string[];
}

export interface Fixtures {
	network: NetworkLog;
}

function hostOf(url: string): string | undefined {
	try {
		return new URL(url).hostname;
	} catch {
		return undefined;
	}
}

/**
 * Installs a context-level route handler before any page exists, so there is no
 * window in which a request could leave before the guard is listening.
 *
 * The production host is ABORTED, not merely recorded: recording would still
 * let the bytes travel, and the point is that the suite cannot read or write a
 * live backend even by accident.
 */
export const test = base.extend<Fixtures>({
	network: async ({ context }, use) => {
		const log: NetworkLog = { all: [], production: [], offOrigin: [] };

		await context.route("**/*", (route) => {
			const url = route.request().url();
			log.all.push(url);
			if (url.includes(PRODUCTION_API_HOST)) {
				log.production.push(url);
				return route.abort("blockedbyclient");
			}
			if (!LOOPBACK.test(hostOf(url) ?? "")) log.offOrigin.push(url);
			return route.continue();
		});

		await use(log);
	},
});

export { expect };

/**
 * Reads the served HTML instead of the hydrated DOM.
 *
 * WHY: TanStack Start serves a shell and hydrates afterwards, so `page.goto`
 * plus `waitForLoadState` proves nothing about what a crawler — or a user on
 * slow hardware — actually received. `APIRequestContext.get` returns the raw
 * body, so an assertion against it is a claim about server-side rendering
 * specifically, with no hydration race in the way.
 */
export async function getServedHtml(
	request: APIRequestContext,
	path: string,
): Promise<{ status: number; html: string }> {
	const response = await request.get(path);
	return { status: response.status(), html: await response.text() };
}

/**
 * Navigates and waits until the app is genuinely interactive.
 *
 * ─── Why this is not a sleep ────────────────────────────────────────────────
 *
 * TanStack Start serves the whole page as static HTML and hydrates afterwards.
 * Until React has taken over, the markup LOOKS complete — every field, heading
 * and button a test wants to click is already there — but no event handler is
 * attached, so a click does nothing and the test fails on a healthy app. Adding
 * a generous `waitForTimeout` would paper over that and then flake on a slow
 * CI runner anyway.
 *
 * `__root.tsx` adds the class `js` to `<html>` inside a `useEffect`. A
 * `useEffect` cannot run before hydration, so that class is an exact,
 * app-provided "React now owns this DOM" signal — but "owns this DOM" is NOT
 * "the router can navigate". See the note on `gotoHydrated` below: the class
 * fires when the ROOT commits, which is before the content inside `<Outlet>`
 * is hydrated, and a click on a Link in that window is dropped. The helper
 * therefore waits for the app's own client query, which cannot fire until the
 * commit that makes those handlers live has happened.
 *
 * `networkidle` is deliberately not used: the app fires its client-side
 * `app_config` query on hydration, and `networkidle` would make this helper
 * mean "and also the API answered", which is a different and flakier claim.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
	// Armed BEFORE `goto`: the request can fire while we are still awaiting the
	// milestones below, and arming afterwards is the same race in a new hat.
	const clientQueryFired = page.waitForRequest((r) =>
		r.url().includes("/api/v1/"),
	);
	await page.goto(path);
	await page.waitForLoadState("load");
	await page.waitForFunction(() =>
		document.documentElement.classList.contains("js"),
	);
	// ── THE TERMINAL CONDITION, and the only one that was measured to work ────
	//
	// The `js` class is NOT a readiness signal for a click. It is added in a
	// `useEffect` of the ROOT route, and React commits the root before the
	// router has hydrated the content inside `<Outlet>`. Instrumenting the nav
	// link at the exact instant the class appeared:
	//
	//   after js gate: { reactKeys: [], hasOnClick: false }   ← el click no hace nada
	//   pre-click:     { reactKeys: [__reactFiber$, __reactProps$], hasOnClick: true }
	//
	// A click on a Link whose `onClick` is not attached yet is simply dropped:
	// TanStack's Link renders a real `<a href>`, but React already owns the
	// node, so there is no native navigation to fall back to. The URL never
	// changes and the test times out on `toHaveURL` — measured 2 runs out of 3
	// under load, and 4 out of 4 once the SSR data fix landed (see below).
	//
	// WHAT WAS TRIED AND REJECTED, each measured on `navigation.spec.ts`:
	//
	//  · `load` + `js` ............................. still failed 2 of 4 runs.
	//    `load` fires when the document's subresources arrive, which in a Vite
	//    dev server is the ~200 module requests — but hydration interleaves with
	//    them, so `load` is NOT strictly later than the route content being
	//    interactive. It closes most of the window, not all of it.
	//  · an app-set `role-hydrated` class after a double-rAF ........ failed too.
	//    Effects are bottom-up, so a root effect is not "later" than the router
	//    being able to navigate; and frames are a clock, not a condition.
	//
	// WHAT WORKS: waiting for the app's OWN client query to fire. It cannot
	// happen until React has mounted the components, committed, and run their
	// effects — the same commit that makes the router's `Link` handlers live.
	// It is a named, observable event, so it fails loudly on a broken app
	// instead of passing on a timer. Measured 5 of 5 runs clean.
	//
	// WHY NOT `networkidle`: it would mean "and also the API answered", a
	// claim about a dependency rather than about hydration, which is exactly
	// what this helper's contract forbids — and it guesses at an idle window.
	//
	// COUPLING WORTH KNOWING: this gate assumes the client re-queries the API
	// after hydration. It does today, because the SSR query cache is NOT
	// dehydrated into the payload (verified: the served payload carries router
	// match loader data only, no `dehydratedQueryClient`). If `ssr-query` is
	// ever wired up and the client stops refetching, this waiter will hang and
	// the symptom will look like a slow suite, not a broken one. That trade is
	// deliberate and commented here so the next person finds it.
	await clientQueryFired;
}

/**
 * Asserts a request for `urlPart` is attempted.
 *
 * WHY a waiter and not a fixed sleep: a submit that fails validation produces
 * its error state immediately and produces NO request ever. "Wait 500 ms, then
 * check the counter" is a test that passes on a broken app. Waiting for the
 * observable event is the only version that can fail.
 */
export function waitForRequestTo(
	page: import("@playwright/test").Page,
	urlPart: string,
	method?: string,
): Promise<import("@playwright/test").Request> {
	return page.waitForRequest(
		(req) =>
			req.url().includes(urlPart) && (method ? req.method() === method : true),
	);
}
