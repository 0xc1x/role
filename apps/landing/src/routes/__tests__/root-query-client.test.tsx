/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * The `/` loader awaits `/stats/platform`, `/app-config/public` and
 * `/offers/random` BEFORE the markup is produced, priming
 * `context.queryClient` — the instance `getRouter()` creates and hands to the
 * router. `RootComponent` then has to put THAT instance in the
 * `QueryClientProvider`, because every component below it reads the data with
 * `useQuery`/`useConfig` instead of reading the loader's return value.
 *
 * The regression this guards is silent and total: a second, empty
 * `createAppQueryClient()` in `RootComponent` still renders a complete-looking
 * page, still returns 200, and still passes every assertion that is not
 * specifically about server-rendered DATA. What it produces is a served HTML
 * with `data-stats-source="loading"`, the "—" placeholder in the hero, and
 * fallback contact addresses — while the hydration payload of that very same
 * response carries the real figures. A crawler reads the first; nobody reads
 * the second. The loaders run "for SEO" and their data never reaches the bytes.
 *
 * It is written as an integration test against the REAL `Route` (only the CSS
 * side-effect import is stubbed) instead of a source-shape assertion like
 * "does not import useState", because the whole failure mode is a wiring detail
 * that a text match on the file would neither catch nor explain.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import { useQuery } from "@tanstack/react-query";
import {
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { createAppQueryClient } from "@/lib/query-client";
import { cleanup, render, waitFor } from "@/test-utils/dom";

// The only thing stubbed is Vite's `?url` CSS import, which is a build-time
// concern with no bearing on the wiring under test. The component, the
// provider and the router are the real ones.
mock.module("../styles.css?url", () => ({ default: "/styles.css" }));

const { Route: RootRoute } = await import("../__root");

/** Seeded value: what the loader put in the cache before rendering. */
const PRIMED = "PRIMED-BY-LOADER";
/** What a component would get if it read a cache nobody primed. */
const FETCHED = "FETCHED-OVER-THE-WIRE";

function Probe() {
	const { data } = useQuery({
		queryKey: ["root-provider-probe"],
		queryFn: async () => FETCHED,
	});
	return <p data-testid="probe">{data ?? "NOTHING"}</p>;
}

describe("RootComponent reuses the router's primed QueryClient", () => {
	afterEach(() => cleanup());

	test("components below the root read the cache the loader filled", async () => {
		// `RootComponent`'s observers are a reveal-on-scroll effect. happy-dom has
		// neither, and neither has anything to do with the cache under test.
		globalThis.IntersectionObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as never;
		globalThis.MutationObserver ??= class {
			observe() {}
			disconnect() {}
		} as never;
		globalThis.scrollTo ??= (() => {}) as never;

		// The REAL client factory, not a hand-rolled one: `staleTime: 30_000` is
		// what makes a primed query readable without an immediate refetch, and it
		// is the same config the loaders prime against in production.
		const queryClient = createAppQueryClient();
		await queryClient.prefetchQuery({
			queryKey: ["root-provider-probe"],
			queryFn: async () => PRIMED,
		});

		const child = createRoute({
			getParentRoute: () => RootRoute,
			path: "/",
			component: Probe,
		});
		const router = createRouter({
			routeTree: RootRoute.addChildren([child]),
			context: { queryClient },
		});

		const { findByTestId } = render(<RouterProvider router={router} />);
		const node = await findByTestId("probe");

		// GREEN: the provider handed down the router's primed client, so the
		// component reads the loader's data on the very first render.
		//
		// RED (the regression): `RootComponent` builds its own empty
		// `createAppQueryClient()`, so nothing is primed, the query runs, and
		// this reads FETCHED-OVER-THE-WIRE. The assertion below therefore
		// discriminates — verified by reverting the fix and watching it fail.
		await waitFor(() => expect(node.textContent).toBe(PRIMED));

		// The discriminator must be the CACHE, not luck about timing: prove the
		// primed value was already there before any network call could land.
		expect(node.textContent).not.toBe(FETCHED);
	});
});
