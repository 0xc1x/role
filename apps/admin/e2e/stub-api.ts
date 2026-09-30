/**
 * The fixture API for the admin e2e, and the half of the network stub that
 * `page.route()` cannot reach.
 *
 * ─── Why this file exists at all ────────────────────────────────────────────
 *
 * `page.route()` intercepts requests made BY THE BROWSER. The admin's auth calls
 * are not made by the browser: `features/auth/server.ts` wraps them in
 * `createServerFn`, so the browser POSTs to the `_serverFn` path on its own
 * origin and the Vite SERVER process is the one that calls the API.
 *
 * That was measured, not assumed: with a `page.route()` handler installed for
 * the whole API surface, a full login produced hits only for `/auth/me`, while
 * this server logged the login POST.
 *
 * `/payouts` and `/categories/admin` were the same case until their route
 * `loader`s were removed — loaders run during SSR, so the Vite server fetched
 * them and `page.route()` never saw either request. They no longer do, so the
 * split is now:
 *
 * | caller                        | who fetches   | how it is stubbed  |
 * | ----------------------------- | ------------- | ------------------ |
 * | auth                          | Vite server   | this file          |
 * | everything else in the panel  | the browser   | `page.route()`     |
 *
 * Both halves import the SAME payload table (`fixtures/api-fixtures.ts`), so they
 * cannot drift apart — see the header there for what happens when they do.
 *
 * WHAT IS NOT HERE, and why: any behaviour of the NestJS API itself. That
 * already has 44 e2e tests in `apps/api/test/`, including the real login. This
 * suite is about the panel.
 */

import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	failureSentinelFor,
	respondTo,
} from "./fixtures/api-fixtures";

/**
 * `expires_at` is an ISO 8601 STRING, and the future value is load bearing.
 *
 * The API emits `new Date(session.expires_at * 1000).toISOString()` — an ISO
 * string built from an epoch in seconds. `commons` types the field as
 * `TimestamptzSchema`, which is deliberately only `z.string().min(1)` (see
 * `packages/commons/AGENTS.md`), so an epoch passed as a *string* ("1789234567")
 * sails through `AuthResponseSchema` unchallenged and then dies in
 * `client.ts`:
 *
 *     new Date("1789234567").getTime()  ->  NaN
 *     Date.now() >= NaN - 300000       ->  false      // never "expired"
 *
 * A token that can never expire, silently, from a payload every schema in the
 * repo accepts. `auth.service.ts:128` is the upstream fix, and this fixture is
 * the pin for it — the mutation run swapped this for a raw epoch string and
 * watched `auth.login.spec.ts` go red. Do not "simplify" it to a number.
 */
const SESSION_TTL_MS = 60 * 60 * 1000;

function sessionFor(now: number) {
	return {
		access_token: "stub-access-token",
		refresh_token: "stub-refresh-token",
		expires_in: Math.floor(SESSION_TTL_MS / 1000),
		expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
		user: {
			id: "11111111-1111-4111-8111-111111111111",
			email: ADMIN_EMAIL,
			full_name: "Ada Admin",
			avatar_url: null,
			role: "admin" as const,
		},
	};
}

/**
 * Byte-identical to what the real API returns, because `loginFn` surfaces
 * `errJson.message` straight into the UI. Copying the message keeps this suite
 * from passing on a string the production backend would never send — the
 * assertion in `auth.login.spec.ts` is meant to prove the panel propagates the
 * API's own error, not that it can render a string.
 */
const INVALID_CREDENTIALS = {
	status: 401,
	body: { message: "Invalid email or password" },
};

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
	// `Authorization` is why this needs a preflight at all.
	"access-control-allow-headers": "content-type,authorization,accept",
};

const port = Number(process.env.ADMIN_E2E_STUB_PORT ?? 4110);

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname.replace(/^\/api\/v1/, "");

		// Playwright's `webServer` polls this before running a single spec.
		if (path === "/__health") return Response.json({ ok: true });

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS });
		}

		// ─── The deliberate outage, on the boundary that can produce it ───────
		//
		// `page.route()` cannot reach a server-function or a route-`loader`
		// fetch, so a browser-only stub cannot express "the API is down" for
		// those. That gap is not hypothetical: it is exactly why a `loader` on
		// `/pagos` or `/categorias` could blank the entire panel with no test able
		// to see it. MEASURED with a probe spec — with the `loader` restored,
		// `page.route()` still saw the browser issue `GET /payouts` and the
		// section rendered its own "Reintentar", because the browser query is not
		// the one that dies. The test passed against the exact defect it was
		// written for.
		//
		// The predicate lives in the shared table and is consulted by BOTH halves
		// of the stub, so the outage means the same thing whichever side fetches.
		// Keying it on a SENTINEL FILTER rather than a global switch is what
		// keeps the suite parallel-safe: this server is shared by every worker,
		// so a boolean one spec flipped would blank the panel inside an unrelated
		// spec running at the same moment. See `failureSentinelFor` for why the
		// sentinel has to be a value the real contract already accepts.
		if (failureSentinelFor(path, url.searchParams)) {
			return Response.json(
				{ message: "stub-api: deliberate outage sentinel" },
				{ status: 500, headers: CORS },
			);
		}

		if (path === "/auth/login" && req.method === "POST") {
			const body = (await req.json().catch(() => ({}))) as {
				email?: string;
				password?: string;
			};
			// One known account. Anything else is refused, exactly as the real API
			// does, so the negative test needs no special-casing.
			if (body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD) {
				return Response.json(sessionFor(Date.now()), { headers: CORS });
			}
			return Response.json(INVALID_CREDENTIALS.body, {
				status: INVALID_CREDENTIALS.status,
				headers: CORS,
			});
		}

		if (path === "/auth/refresh" && req.method === "POST") {
			return Response.json(sessionFor(Date.now()), { headers: CORS });
		}

		if (path === "/auth/logout" && req.method === "POST") {
			return Response.json({ message: "ok" }, { headers: CORS });
		}

		// The server-fetched list routes. Same table the browser side uses.
		const body = respondTo(path);
		if (body !== undefined) {
			return Response.json(body, { headers: CORS });
		}

		// Unknown path. Say so loudly: this is what turns "a spec forgot to stub
		// something" into a red test instead of a green one.
		return Response.json(
			{ message: `stub-api has no handler for ${req.method} ${path}` },
			{ status: 404, headers: CORS },
		);
	},
});
