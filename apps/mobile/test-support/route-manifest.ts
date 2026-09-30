/**
 * The mobile route tree, DERIVED FROM THE FILESYSTEM.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * A notification link is a string the backend writes and the client has to
 * resolve. Nothing in the type system connects the two, so the failure mode is
 * a push that opens nothing — silent, and invisible to every suite that
 * asserts the producer emitted "the right string".
 *
 * The fix is to stop treating the route list as a thing you can write down.
 * A hand-written list is only correct on the day it is written: the next
 * invented path passes the test the same way a correct one does. So the
 * filesystem is the source of truth, this module reads it, and callers match
 * against what is actually there.
 *
 * ─── The expo-router rules encoded here ─────────────────────────────────────
 *
 * 1. A route group `(name)` is ERASED from the web URL. `app/(consumer)/
 *    orders.tsx` and `app/(business)/orders.tsx` are both the path `/orders`.
 *    Two files, one URL — which is exactly why a link has to be checked
 *    against the AUDIENCE it names, not just against the path.
 * 2. A dynamic segment `[id]` matches any single segment.
 * 3. `_layout.tsx` (and `+api`, `+not-found`) is not a route on its own.
 * 4. `index.tsx` collapses onto the path of the folder that holds it.
 * 5. A platform suffix (`.web`, `.native`, …) is not part of the name.
 *
 * These are assertions ABOUT expo-router, verified against the package's own
 * resolver in `route-manifest.test.ts`. If expo-router changes its mind about
 * any of them, that test is what notices — not a user with a dead push.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** What one segment of a derived route is. */
export type RouteSegmentKind = "static" | "group" | "dynamic" | "catchAll";

export type RouteSegment = {
	readonly kind: RouteSegmentKind;
	readonly value: string;
};

/** One leaf screen, as the router sees it. */
export type ManifestEntry = {
	/** The href expo-router addresses it by, groups included: `/(business)/orders`. */
	readonly internalPath: string;
	/** The URL a browser shows, groups erased: `/orders`. */
	readonly webPath: string;
	/** Segments of the internal path, in order, with `index` already collapsed. */
	readonly segments: readonly RouteSegment[];
	/** Path of the file this entry came from, relative to `app/`. */
	readonly file: string;
};

export type RouteManifest = {
	readonly entries: readonly ManifestEntry[];
	/** web path → every entry claiming it. More than one means a collision. */
	readonly claimants: ReadonlyMap<string, readonly ManifestEntry[]>;
	/** Every `.tsx`/`.ts` file walked under `app/`. */
	readonly routeFileCount: number;
	/** Files walked that are deliberately not routes (`_layout`, `+api`, …). */
	readonly excludedFileCount: number;
};

const ROUTE_FILE = /\.tsx?$/;
/** `orders.web.tsx` is the `orders` route with a platform preference. */
const PLATFORM_SUFFIX = /\.(web|native|ios|android)$/;
const GROUP = /^\((.+)\)$/;
const DYNAMIC = /^\[(.+)\]$/;
const CATCH_ALL = /^\[\.\.\.(.+)\]$/;

function segmentKind(segment: string): RouteSegmentKind {
	if (CATCH_ALL.test(segment)) return "catchAll";
	if (DYNAMIC.test(segment)) return "dynamic";
	if (GROUP.test(segment)) return "group";
	return "static";
}

function toSegments(parts: readonly string[]): readonly RouteSegment[] {
	return parts.map((value) => ({ kind: segmentKind(value), value }));
}

function joinPath(segments: readonly RouteSegment[]): string {
	if (segments.length === 0) return "/";
	return `/${segments.map((segment) => segment.value).join("/")}`;
}

/**
 * Walk `appDir` and build the route manifest.
 *
 * @param appDir absolute path to the expo-router `app/` directory.
 */
export function buildRouteManifest(appDir: string): RouteManifest {
	const entries: ManifestEntry[] = [];
	let routeFileCount = 0;
	let excludedFileCount = 0;

	const walk = (dir: string, dirSegments: readonly string[]): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath, [...dirSegments, entry.name]);
				continue;
			}
			if (!ROUTE_FILE.test(entry.name)) continue;
			routeFileCount += 1;

			const base = entry.name
				.replace(ROUTE_FILE, "")
				.replace(PLATFORM_SUFFIX, "");
			// `_layout` configures the folder it sits in; `+api` and
			// `+not-found` are endpoints. None of them is a screen to open.
			if (base.startsWith("_") || base.startsWith("+")) {
				excludedFileCount += 1;
				continue;
			}

			// Rule 4: `index` is the folder, not a segment of its own.
			const raw = base === "index" ? dirSegments : [...dirSegments, base];
			const segments = toSegments(raw);
			// Rule 1: groups never reach the URL.
			const webSegments = segments.filter(
				(segment) => segment.kind !== "group",
			);

			entries.push({
				internalPath: joinPath(segments),
				webPath: joinPath(webSegments),
				segments,
				file: [...dirSegments, entry.name].join("/"),
			});
		}
	};

	walk(appDir, []);

	const claimants = new Map<string, ManifestEntry[]>();
	for (const entry of entries) {
		claimants.set(entry.webPath, [
			...(claimants.get(entry.webPath) ?? []),
			entry,
		]);
	}

	entries.sort((a, b) =>
		a.internalPath < b.internalPath
			? -1
			: a.internalPath > b.internalPath
				? 1
				: 0,
	);
	for (const list of claimants.values()) {
		list.sort((a, b) => (a.internalPath < b.internalPath ? -1 : 1));
	}

	return {
		entries,
		claimants,
		routeFileCount,
		excludedFileCount,
	};
}

/**
 * The web paths two or more groups both claim.
 *
 * These are the paths where "the route exists" stops being a sufficient
 * answer, because the URL alone does not say which audience gets it.
 */
export function ambiguousWebPaths(manifest: RouteManifest): readonly string[] {
	return [...manifest.claimants.entries()]
		.filter(([, list]) => list.length > 1)
		.map(([path]) => path)
		.sort();
}

/** What a segment of a backend-authored link is. */
export type LinkSegmentKind = "static" | "group" | "param";

export type LinkSegment = {
	readonly kind: LinkSegmentKind;
	readonly value: string;
};

/**
 * Split a link into segments, understanding the three shapes a producer writes:
 * a literal (`/orders`), a template hole (`` /order/${order.id} ``), and a route
 * group (`/(business)/orders`).
 */
export function parseLink(link: string): readonly LinkSegment[] {
	return link
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((value): LinkSegment => {
			if (value.includes("${")) return { kind: "param", value };
			const group = GROUP.exec(value);
			if (group) return { kind: "group", value };
			return { kind: "static", value };
		});
}

/**
 * Whether one derived entry is the screen a link asks for.
 *
 * The asymmetry is the whole point:
 *
 * - a `param` in the link (`${order.id}`) matches a `dynamic` route segment,
 *   because the producer chose the segment and the router accepts anything;
 * - a LITERAL in the link does NOT match a `dynamic` route segment, because
 *   that would let a typo like `/order/ab-12` pass by being swallowed by a
 *   wildcard. The link has to name the shape it expects.
 * - a `group` in the link matches only that same group. This is what makes the
 *   audience check work: `/(business)/orders` cannot quietly resolve to the
 *   consumer's screen, even though both are the URL `/orders`.
 */
function entryMatchesLink(
	entry: ManifestEntry,
	link: readonly LinkSegment[],
): boolean {
	let cursor = 0;
	for (const segment of entry.segments) {
		// A catch-all swallows the rest of the link, so nothing after it can
		// contradict the match. Checked before the cursor advances, which is
		// why the switch below does not repeat it.
		if (segment.kind === "catchAll") return true;
		const target = link[cursor];
		if (target === undefined) return false;
		switch (segment.kind) {
			case "static":
				if (target.kind !== "static" || target.value !== segment.value) {
					return false;
				}
				break;
			case "group":
				if (target.kind !== "group" || target.value !== segment.value) {
					return false;
				}
				break;
			case "dynamic":
				// Accepts an interpolated value or a literal one; the router
				// hands both to the same screen. A group is not a value.
				if (target.kind === "group") return false;
				break;
		}
		cursor += 1;
	}
	return cursor === link.length;
}

/** Every entry a link resolves to. More than one means the link is ambiguous. */
export function resolveLink(
	manifest: RouteManifest,
	link: string,
): readonly ManifestEntry[] {
	const segments = parseLink(link);
	return manifest.entries.filter((entry) => entryMatchesLink(entry, segments));
}

/** The route groups a link names, outermost first. */
export function groupsNamedByLink(link: string): readonly string[] {
	return parseLink(link)
		.filter((segment) => segment.kind === "group")
		.map((segment) => segment.value);
}
