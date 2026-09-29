/**
 * Stub API for the landing e2e suite.
 *
 * ─── Why a stub SERVER and not only `page.route()` ──────────────────────────
 *
 * `page.route()` intercepts traffic from the BROWSER. The landing resolves its
 * data in a TanStack Start `loader`, and that loader runs in the Vite dev
 * server's own Node process during SSR. A `page.route()` handler has no way to
 * see that request: it is not the browser's socket, it is Bun's. So the SSR
 * half of every data flow is only controllable from the server side, and a
 * browser-only stub would leave SSR pointed wherever `.env` points.
 *
 * That is not hypothetical. `apps/landing/.env` ships
 * `VITE_API_URL=https://role-0hjz.onrender.com/api/v1` — a real backend in
 * production — and the `/` loader awaits `/stats/platform` on every request.
 * Measured: a plain `GET /` against the dev server opened TLS connections to
 * `216.24.57.18:443` (that host) and took 2.77 s on a cold instance.
 *
 * So the e2e runs the dev server with `VITE_API_URL` pointed here, and this
 * process is the only origin the suite can reach. It is loopback-only and it
 * NEVER proxies: an unknown path is a 404, not a forward. A test can therefore
 * never turn into a production write by accident, and the suite stays
 * deterministic and fast.
 *
 * The shapes below are the SSOT contracts from `@0xc1x/role-commons`; a stub
 * that returned a wrong shape would make the suite pass while testing nothing.
 */
import {
	OnboardingBusinessRequestSchema,
	OnboardingBusinessResponseSchema,
	PlatformStatsSchema,
	PublicAppConfigSchema,
} from "@0xc1x/role-commons";

const PORT = Number(process.env.STUB_API_PORT ?? 3999);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

/** Values chosen to be unmistakable in the DOM (see the config flow specs). */
const STATS = PlatformStatsSchema.parse({
	users: 12_345,
	businesses: 678,
	meals_saved: 90_123,
});

const APP_CONFIG = [
	{ key: "contact.hola_email", value: "hola@e2e.example", value_type: "string" },
	{
		key: "contact.negocios_email",
		value: "negocios@e2e.example",
		value_type: "string",
	},
	{
		key: "legal.contact_email",
		value: "legal@e2e.example",
		value_type: "string",
	},
	// `/privacy` reads `privacy.contact_email`, NOT `legal.contact_email`.
	// The legal pages fall back to "…pendiente de configuración" when their
	// key is missing, which is a plausible-looking published contract, so the
	// stub has to carry the key each page actually reads.
	{
		key: "privacy.contact_email",
		value: "privacidad@e2e.example",
		value_type: "string",
	},
	{
		key: "legal.controller_identity",
		value: "Rolé Ecuador S.A.",
		value_type: "string",
	},
	{
		key: "legal.terms_updated_at",
		value: "2026-01-12",
		value_type: "string",
	},
	{
		key: "legal.privacy_updated_at",
		value: "2026-01-12",
		value_type: "string",
	},
	{
		key: "social.instagram_url",
		value: "https://e2e.example/instagram",
		value_type: "string",
	},
].map((entry) => PublicAppConfigSchema.parse(entry));

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
			// The client bundle reads the API cross-origin from the dev server.
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "*",
			"access-control-allow-methods": "GET,POST,OPTIONS",
		},
	});
}

// ── Never proxies ────────────────────────────────────────────────────────────
// An unknown path is a 404, never a forward. A typo in a test must not turn
// into an outbound request to a real backend.
Bun.serve({
	port: PORT,
	hostname: "127.0.0.1",
	async fetch(req) {
		const url = new URL(req.url);
		if (req.method === "OPTIONS") return json(null, 204);

		// ── Reads the SSR loaders depend on ──────────────────────────────────
		if (url.pathname === "/api/v1/stats/platform") return json(STATS);
		if (url.pathname === "/api/v1/app-config/public") return json(APP_CONFIG);
		// `null` is a contract-valid "no active offer right now"; the hero card
		// has a designed fallback for it, so this exercises the real empty path
		// instead of a fabricated offer that would need a 40-field stub.
		if (url.pathname === "/api/v1/offers/random") return json(null);

		// ── The only WRITE endpoint the landing has ───────────────────────────
		// Reached in practice from the browser, which `page.route()` stubs per
		// test. This handler is a safety net: if a future test forgets to stub,
		// the request still lands on loopback and validates, so the stub itself
		// can report a contract mismatch instead of silently passing.
		if (url.pathname === "/api/v1/businesses/onboarding") {
			const raw: unknown = await req.json().catch(() => null);
			const parsed = OnboardingBusinessRequestSchema.safeParse(raw);
			if (!parsed.success) return json({ message: "Payload inválido" }, 400);
			return json(OnboardingBusinessResponseSchema.parse({ message: "ok" }), 201);
		}

		// Anything else is a 404, never a forward (see the note above).
		return json({ message: `stub: no route for ${url.pathname}` }, 404);
	},
});

// Printed so Playwright's `webServer` log shows the exact API base in use when
// a failure needs to be traced back to which origin was mounted.
console.log(`[e2e stub] listening on ${BASE}`);
console.log(`[e2e stub] pid ${process.pid}`);
