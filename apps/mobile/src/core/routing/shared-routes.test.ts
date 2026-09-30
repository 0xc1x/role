import { describe, expect, it, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
	AMBIGUOUS_ROUTE_OWNER_GROUP,
	CONSUMER_ROUTE_FOR_SHARED_PATH,
	consumerRouteForPathname,
	decideSharedRoute,
	normalizeRoutePath,
} from "@/src/core/routing/shared-routes";

const APP_DIR = join(import.meta.dir, "../../../app");

/**
 * The leaf routes a group claims, as the web paths they produce.
 *
 * Route groups are erased from the URL, so `app/(consumer)/orders.tsx` is the
 * path `/orders`. Reading the directory is the only way to know what the route
 * tree actually claims — which is the whole point of the test below.
 */
function pathsClaimedBy(group: string): string[] {
	return readdirSync(join(APP_DIR, group), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
		.map((entry) => entry.name.replace(/\.tsx$/, ""))
		.filter((name) => name !== "_layout")
		.map((name) => (name === "index" ? "/" : `/${name}`))
		.sort();
}

describe("the map matches the route tree", () => {
	// This is the guard that keeps the bug from coming back under a new name.
	// A developer who adds `app/(business)/payments.tsx` while
	// `app/(consumer)/payments.tsx` exists re-creates the collision; the group
	// keeps winning the URL and a consumer deep link dies exactly the way this
	// one did. A comment in the layout would not notice. Reading `app/` does.
	//
	// It is an equality and not a subset on purpose: a stale entry (a map key
	// for a route that no longer collides) is as wrong as a missing one, and it
	// is the kind of thing that survives a rename and quietly redirects a
	// business to a screen that is not there.
	test("every path claimed by both groups is registered, and nothing else is", () => {
		const consumer = pathsClaimedBy("(consumer)");
		const colliding = pathsClaimedBy(AMBIGUOUS_ROUTE_OWNER_GROUP).filter(
			(path) => consumer.includes(path),
		);

		expect(colliding).toEqual(
			Object.keys(CONSUMER_ROUTE_FOR_SHARED_PATH).sort(),
		);
	});

	test("the registered consumer routes really exist in the consumer group", () => {
		const consumer = pathsClaimedBy("(consumer)");
		for (const href of Object.values(CONSUMER_ROUTE_FOR_SHARED_PATH)) {
			const path = String(href).replace("/(consumer)", "") || "/";
			expect(consumer).toContain(path);
		}
	});
});

describe("normalizeRoutePath", () => {
	it("strips query, hash and trailing slash, and never returns empty", () => {
		expect(normalizeRoutePath("/orders?tab=history")).toBe("/orders");
		expect(normalizeRoutePath("/orders#top")).toBe("/orders");
		expect(normalizeRoutePath("/orders/")).toBe("/orders");
		expect(normalizeRoutePath("")).toBe("/");
		expect(normalizeRoutePath("/")).toBe("/");
	});
});

describe("decideSharedRoute", () => {
	const consumer = { role: "user", sessionResolved: true } as const;
	const business = { role: "business", sessionResolved: true } as const;
	const unresolved = { role: undefined, sessionResolved: false } as const;

	it("hands a consumer the consumer route for a path both groups claim", () => {
		// The state a direct load of /orders produces: the router resolved the
		// ambiguous URL to the business group, and the viewer is a consumer.
		expect(
			decideSharedRoute("/orders", ["(business)", "orders"], consumer),
		).toEqual({ kind: "redirect", href: "/(consumer)/orders" });
	});

	it("leaves the business panel alone on its own deep link", () => {
		// Its notifications already point here; redirecting it would break the
		// push that is supposed to be the reason this path exists.
		expect(
			decideSharedRoute("/orders", ["(business)", "orders"], business),
		).toEqual({ kind: "none" });
	});

	it("waits for the session instead of guessing the audience", () => {
		// Guessing is what breaks it: a redirect decided before the profile
		// resolves sends a business owner to the consumer's order list.
		expect(
			decideSharedRoute("/orders", ["(business)", "orders"], unresolved),
		).toEqual({ kind: "wait" });
	});

	it("does nothing once the router already resolved the path to the consumer group", () => {
		// THE loop guard. `/(consumer)/orders` writes `/orders` back to the URL,
		// so the next render sees a path it already handled. Without this case
		// the redirect re-feeds itself forever: measured, the replace repeated
		// indefinitely and the app never painted.
		expect(
			decideSharedRoute("/orders", ["(consumer)", "orders"], consumer),
		).toEqual({ kind: "none" });
	});

	it("does not touch a path that is not shared", () => {
		// `/explore` and `/profile` have no business counterpart, which is what
		// makes the original defect a collision and not "deep links are broken".
		expect(
			decideSharedRoute("/explore", ["(business)", "explore"], consumer),
		).toEqual({ kind: "none" });
	});

	it("leaves a guest alone", () => {
		// Whether a signed-out visitor may see orders is the job of
		// `app/index.tsx` and the screens, not of the routing tiebreak.
		expect(
			decideSharedRoute("/orders", ["(business)", "orders"], {
				role: undefined,
				sessionResolved: true,
			}),
		).toEqual({ kind: "none" });
	});
});

describe("consumerRouteForPathname", () => {
	it("normalizes before matching, and returns null for unshared paths", () => {
		expect(consumerRouteForPathname("/orders/")).toBe("/(consumer)/orders");
		expect(consumerRouteForPathname("/orders?x=1")).toBe("/(consumer)/orders");
		expect(consumerRouteForPathname("/products")).toBeNull();
	});
});
