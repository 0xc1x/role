import { describe, expect, it, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
	ambiguousWebPaths,
	buildRouteManifest,
	groupsNamedByLink,
	parseLink,
	resolveLink,
	type LinkSegment,
	type ManifestEntry,
	type RouteManifest,
} from "../../../test-support/route-manifest";

const APP_DIR = join(import.meta.dir, "../../../app");
// src/core/routing -> src -> mobile -> apps -> repo root
const REPO_ROOT = join(import.meta.dir, "../../../../..");

const manifest: RouteManifest = buildRouteManifest(APP_DIR);

/**
 * Every link a backend producer writes, paired with the file it was read from.
 *
 * Discovered by SCANNING the producer sources, not by listing them here. That
 * asymmetry is the entire point of this file: a hand-kept list of links is a
 * hand-kept list of links, and the next producer that invents a path would
 * simply not be in it. Scan, and a new emitter is covered the day it is
 * written.
 */
type EmittedLink = {
	readonly file: string;
	readonly line: number;
	/** The raw source text, so a failure points at real code. */
	readonly source: string;
	/** The link with template holes left intact. */
	readonly link: string;
	/**
	 * The audience the payload declares for itself, when it declares one.
	 *
	 * `data: { link: …, role: "business" }` is a push that says "I am for a
	 * business owner" and, separately, "here is where to go". Those two have to
	 * agree, and only the second is a path — so the first is what the link is
	 * checked against. Without it the audience check is circular: a link that
	 * says `(consumer)` always agrees with the consumer screen.
	 */
	readonly declaredRole: string | null;
};

/** Producer trees that can emit a notification `link`. */
const PRODUCER_ROOTS = [
	join(REPO_ROOT, "supabase/functions"),
	join(REPO_ROOT, "apps/api/src"),
];

/** Test files describe links; they do not emit them. */
function isProducerSource(file: string): boolean {
	return (
		/\.tsx?$/.test(file) &&
		!/\.test\.tsx?$/.test(file) &&
		!/\.spec\.tsx?$/.test(file) &&
		!file.includes("/__tests__/")
	);
}

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...sourceFiles(full));
		} else if (isProducerSource(entry.name)) {
			out.push(full);
		}
	}
	return out;
}

/**
 * The `link` values a producer assigns, from `link: "…"` and ``link: `…` ``.
 *
 * Deliberately narrow: it matches the payload field, and not every identifier
 * called `link` (the auth service has a local `link` variable that is a
 * recovery URL, and the FCM payload re-reads `data.link`). Those are not
 * router targets and must not be judged as if they were.
 */
const LINK_ASSIGNMENT = /\blink:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/g;

/**
 * The `role` declared in the payload object a link belongs to.
 *
 * Scoped to the enclosing payload literal rather than the whole file, because
 * a producer file emits pushes for several audiences and only the object
 * around THIS link describes it. The `baseData({ … })` shape is a call rather
 * than an object literal, but it is still the payload, so it opens the scope
 * too.
 */
function declaredRoleNear(source: string, index: number): string | null {
	const before = source.slice(0, index);
	// The nearest payload opening before the link.
	const open = Math.max(
		before.lastIndexOf("data: {"),
		before.lastIndexOf("pushes.push({"),
		before.lastIndexOf("data: baseData({"),
	);
	if (open === -1) return null;
	const after = source.slice(open, source.indexOf("}", index));
	const role = /\brole:\s*['"]([a-z]+)['"]/.exec(after);
	return role?.[1] ?? null;
}

function collectEmittedLinks(): readonly EmittedLink[] {
	const found: EmittedLink[] = [];
	for (const root of PRODUCER_ROOTS) {
		for (const file of sourceFiles(root)) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(LINK_ASSIGNMENT)) {
				const link = match[1] ?? match[2] ?? match[3];
				if (link === undefined) continue;
				// Only internal router targets are in scope. An absolute URL
				// is a different contract (and `absoluteUrl` in the FCM
				// dispatcher is what turns these into one).
				if (!link.startsWith("/")) continue;
				const line = source.slice(0, match.index).split("\n").length;
				found.push({
					file: file.slice(REPO_ROOT.length + 1),
					line,
					source: match[0].trim(),
					link,
					declaredRole: declaredRoleNear(source, match.index),
				});
			}
		}
	}
	return found.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
	);
}

const EMITTED: readonly EmittedLink[] = collectEmittedLinks();

/** `file:line` so a failure is a place to go, not a mystery. */
function at(emitted: EmittedLink): string {
	return `${emitted.file}:${emitted.line} (${emitted.source})`;
}

// ─── The guard on the guard ───────────────────────────────────────────────
//
// Everything below is a `for` loop over derived data. A loop over an empty
// list is trivially true, so a broken deriver would turn this whole file into
// a green lie. These run FIRST and fail loudly if the deriver goes blind:
// a moved `app/`, a renamed module, a `.tsx`-only assumption, a group that
// stopped being erased.

describe("the route deriver can still see the route tree", () => {
	test("it walked real files and produced routes from them", () => {
		expect(manifest.routeFileCount).toBeGreaterThan(0);
		expect(manifest.entries.length).toBeGreaterThan(0);
		// Every non-route file is accounted for, so nothing was silently
		// dropped by a filter that stopped matching.
		expect(manifest.entries.length + manifest.excludedFileCount).toBe(
			manifest.routeFileCount,
		);
	});

	test("a single broken link cannot empty the emitter set", () => {
		// The deriver and the scanner are independent failure modes. If either
		// returned nothing, the main loop below would pass without checking a
		// single link, so both are asserted to be non-empty on their own.
		expect(EMITTED.length).toBeGreaterThan(0);
		expect(EMITTED.some((e) => e.link.includes("${"))).toBe(true);
		expect(EMITTED.some((e) => !e.link.includes("${"))).toBe(true);
	});

	test("groups are erased from the web path, kept in the internal one", () => {
		// If expo-router stopped erasing groups this would be the first thing
		// to go wrong, and it would be a router-wide change, not a link bug.
		const orders = manifest.entries.filter(
			(entry) => entry.internalPath === "/(consumer)/orders",
		);
		expect(orders).toHaveLength(1);
		expect(orders[0]?.webPath).toBe("/orders");
	});

	test("it still finds the routes this file reasons about", () => {
		// Anchors, not an inventory: enough to prove the tree is the real one
		// and the two audience groups are both still there.
		for (const path of ["/(consumer)/orders", "/(business)/orders"]) {
			expect(resolveLink(manifest, path).map((e) => e.internalPath)).toEqual([
				path,
			]);
		}
	});
});

describe("every link a backend emits resolves to a real route", () => {
	// The hole this file exists to close. A notification link is a promise made
	// by one codebase about the shape of another: the producer writes a string,
	// the router has to have a screen there. Nothing in the type system spans
	// that gap, and a suite that asserts the producer emitted "the right
	// string" cannot see a gap — if the string is wrong, the assertion is
	// wrong in exactly the same way and the test stays green.
	//
	// So the two halves are checked separately: the string is not checked
	// here, and whether a screen exists is checked against the filesystem.
	for (const emitted of EMITTED) {
		test(`${at(emitted)} opens a screen that exists`, () => {
			const resolved = resolveLink(manifest, emitted.link);
			expect(
				resolved.length,
				`${at(emitted)} resolves to no route in app/. ` +
					`Build the manifest from apps/mobile/app so a new screen is ` +
					`covered automatically.`,
			).toBeGreaterThan(0);
		});
	}
});

/**
 * The route group that serves a declared role.
 *
 * A payload saying `role: "business"` is a push for a business owner, and the
 * business panel lives in the `(business)` group. The two names come from
 * different vocabularies — a database role and a folder in `app/` — so the
 * correspondence is stated once here rather than guessed per producer.
 */
const GROUP_FOR_ROLE: Readonly<Record<string, string>> = {
	business: "(business)",
	user: "(consumer)",
};

describe("a link resolves to the audience its producer intended", () => {
	// "The route exists" is not the question, because of this:
	//
	//   app/(consumer)/orders.tsx  →  /orders
	//   app/(business)/orders.tsx  →  /orders
	//
	// On web both are the same URL, and the router has to pick. A link that
	// resolves to EITHER of them passes an existence check, so existence cannot
	// see the defect. This is the check that can.
	//
	// The audience is taken from the payload's own `role`, never from the
	// group named inside the link: a link that says `(consumer)` always agrees
	// with the consumer screen, so testing it against itself is circular and
	// passes for a business owner's push pointed at their customer's list.
	for (const emitted of EMITTED.filter((e) => e.declaredRole !== null)) {
		test(`${at(emitted)} agrees with role "${emitted.declaredRole}"`, () => {
			const expectedGroup = GROUP_FOR_ROLE[emitted.declaredRole ?? ""];
			if (expectedGroup === undefined) return;
			const resolved = resolveLink(manifest, emitted.link);
			expect(resolved.length).toBeGreaterThan(0);
			for (const entry of resolved) {
				expect(
					entry.segments.some(
						(s) => s.kind === "group" && s.value === expectedGroup,
					),
					`${at(emitted)} is addressed to role "${emitted.declaredRole}", ` +
						`so it must open inside ${expectedGroup}, but it resolves ` +
						`to ${entry.internalPath}. Both groups are the web path ` +
						`${entry.webPath}; the group is the only thing telling them ` +
						`apart.`,
				).toBe(true);
			}
		});
	}

	test("the role vocabulary this check knows about still exists", () => {
		// The scanner reads `role:` out of producer sources. If a producer ever
		// stopped declaring one, the audience loop above would quietly shrink
		// to nothing and stop checking — so assert that pushes which are
		// demonstrably for a business owner are still declaring it.
		const forBusiness = EMITTED.filter((e) => e.file.includes("notification"));
		expect(forBusiness.length).toBeGreaterThan(0);
		expect(forBusiness.some((e) => e.declaredRole === "business")).toBe(true);
	});
});

describe("a link that names a group stays inside that group", () => {
	// The complementary invariant, and the one that catches a link whose group
	// contradicts the route it resolves to. Together with the role check above
	// neither half is circular: this one binds the link to the filesystem, the
	// other binds the link to the producer's intent.
	for (const emitted of EMITTED.filter(
		(e) => groupsNamedByLink(e.link).length > 0,
	)) {
		test(`${at(emitted)} stays inside the group it names`, () => {
			const named = groupsNamedByLink(emitted.link);
			const resolved = resolveLink(manifest, emitted.link);
			expect(resolved.length).toBeGreaterThan(0);
			for (const entry of resolved) {
				const groupsInRoute = entry.segments
					.filter((segment) => segment.kind === "group")
					.map((segment) => segment.value);
				// Every group the link named is the group the route is in.
				// A link saying `(business)` that lands in `(consumer)` is the
				// exact failure a plain existence check waves through.
				expect(groupsInRoute).toEqual([...named]);
			}
		});
	}
});

/**
 * The app root, which is a deliberate exception to the rule below.
 *
 * `link: "/"` is not ambiguous even though `/` has two claimants: the winner
 * is `app/index.tsx`, and that file is the role-aware boot gate — it reads the
 * profile and replaces the route with the consumer home, the business panel,
 * or onboarding. "Go to the app" is answered by the app.
 *
 * The exemption is only sound while that gate exists, so the exemption is
 * asserted rather than assumed: delete the gate and this stops being a
 * special case and goes back to being a defect.
 */
const APP_ROOT = "/";

describe("links that name no group are not caught in a route collision", () => {
	// The complement of the rule above. A group-less link is a claim that the
	// path is unambiguous; when two groups claim it, whoever opens the push
	// gets a coin flip decided by route order. There the audience is settled
	// by the shared-route policy instead, which is a separate module with its
	// own test — what matters here is that we notice the ambiguity rather than
	// let a collision pass as a clean resolution.
	for (const emitted of EMITTED.filter(
		(e) => groupsNamedByLink(e.link).length === 0,
	)) {
		test(`${at(emitted)} is not caught in a route collision`, () => {
			const resolved = resolveLink(manifest, emitted.link);
			expect(resolved.length).toBeGreaterThan(0);
			// Templates are not part of the collision question: `${id}` names a
			// dynamic segment, which no group can also claim.
			const hasTemplate = parseLink(emitted.link).some(
				(segment: LinkSegment) => segment.kind === "param",
			);
			if (hasTemplate) return;
			const ambiguous = ambiguousWebPaths(manifest);
			for (const entry of resolved) {
				if (!ambiguous.includes(entry.webPath)) continue;
				if (entry.webPath === APP_ROOT) continue;
				expect.unreachable(
					`${at(emitted)} resolves to ${entry.internalPath}, whose ` +
						`web path ${entry.webPath} is claimed by more than one ` +
						`group. A group-less link cannot say which audience it ` +
						`means. Name the group in the link.`,
				);
			}
		});
	}

	test("the app root is a role-aware gate, which is why `/` is exempt", () => {
		// The exemption above rests entirely on this. `app/index.tsx` is the
		// file that receives a `link: "/"` push and decides where the viewer
		// goes; if it is renamed, moved out of the root, or deleted, `/`
		// silently becomes a real collision and this test starts lying.
		const root = manifest.entries.find(
			(entry) => entry.webPath === APP_ROOT && entry.file === "index.tsx",
		);
		expect(
			root,
			"app/index.tsx is the boot gate; `/` depends on it",
		).toBeDefined();
	});
});

// ─── The deriver itself, checked against expo-router's own rules ──────────

describe("the manifest encodes expo-router's rules", () => {
	const entryFor = (internalPath: string): ManifestEntry | undefined =>
		manifest.entries.find((entry) => entry.internalPath === internalPath);

	it("collapses index onto its folder", () => {
		expect(entryFor("/")?.file).toBe("index.tsx");
		// `(consumer)/profile/index.tsx` is the internal `/(consumer)/profile`
		// and the web `/profile` — one file, two addresses, and the group is
		// what tells them apart.
		const profile = entryFor("/(consumer)/profile");
		expect(profile?.file).toBe("(consumer)/profile/index.tsx");
		expect(profile?.webPath).toBe("/profile");
	});

	it("does not turn a layout into a route", () => {
		expect(entryFor("/_layout")).toBeUndefined();
		expect(manifest.excludedFileCount).toBeGreaterThan(0);
	});

	it("treats a dynamic segment as matching one segment", () => {
		expect(
			resolveLink(manifest, "/order/abc").map((e) => e.internalPath),
		).toEqual(["/order/[id]"]);
		// A literal must not be swallowed by a wildcard: this is what keeps a
		// typo from passing as a match.
		expect(resolveLink(manifest, "/order/ab/cd")).toEqual([]);
	});

	it("lets a template hole stand in for a dynamic segment", () => {
		// Not a real template: the point is that the parser sees the literal
		// text a producer's backtick string contains.
		const link = "/offer/$" + "{offer.id}";
		expect(resolveLink(manifest, link).map((e) => e.internalPath)).toEqual([
			"/offer/[id]",
		]);
	});

	it("keeps a group out of the web path and in the internal one", () => {
		const business = entryFor("/(business)/orders");
		expect(business?.webPath).toBe("/orders");
		expect(business?.file).toBe("(business)/orders.tsx");
	});

	it("reports the paths two groups both claim", () => {
		expect(ambiguousWebPaths(manifest)).toContain("/orders");
	});
});
