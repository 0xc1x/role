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
	AnnouncementSchema,
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

/**
 * ─── `/announcements`: lo que el operador escribió, y en qué estado falla ────
 *
 * `ANNOUNCEMENTS_MODE` decide qué contesta esta ruta, y lo decide el SPEC, por
 * `POST /__stub/announcements`. Tres modos, y los tres existen por una razón
 * cada uno:
 *
 *  - `caido` es el DEFAULT, y devuelve el 503 que devuelve el service real
 *    ("No se pudieron obtener los anuncios"). Que el default sea el fallo no es
 *    una comodidad: deja a las CUARENTA pruebas de esta suite corriendo contra
 *    una API de anuncios caída, o sea que "un 500 de /announcements no tumba la
 *    landing" queda probado en cada una de ellas, gratis. Con el default sano,
 *    el único test que lo probaría sería el que lo pide —y ese test se puede
 *    borrar, o dejar de correr, sin que nada lo note.
 *  - `hostil` sirve el `body` y el `title` de un operador con `<script>`,
 *    `<b>`, `<img onerror>` y `javascript:`. Es el único modo donde la banda se
 *    pinta, así que es el que mide la frontera de seguridad sobre el HTML
 *    servido de verdad.
 *  - `benigno` sirve el mismo aviso con texto trivial. Existe para el DIFF de
 *    inventario de etiquetas: sirve de línea base contra la que se afirma que
 *    el cuerpo del operador no construyó ningún elemento.
 *
 * Las dos filas pasan por `AnnouncementSchema.parse` antes de servirse, por la
 * razón de arriba del archivo: un stub que devolviera una forma que el contrato
 * no acepta haría que la suite pasara probando nada.
 */
type AnnouncementsMode = "caido" | "hostil" | "benigno";

const ANNOUNCEMENTS: Record<
	AnnouncementsMode,
	{ status: number; body: unknown }
> = {
	caido: {
		status: 503,
		body: { message: "No se pudieron obtener los anuncios" },
	},
	hostil: {
		status: 200,
		body: [
			AnnouncementSchema.parse({
				id: "a0000000-0000-4000-8000-0000000000e1",
				title: "Mantenimiento <b>esta noche</b>",
				body: '<script>alert(1)</script> y <b>negrita</b> con <img src=x onerror="alert(2)"> y <a href="javascript:alert(3)">enlace</a>',
				severity: "info",
				audience_kind: "all",
				priority: 5,
				active: true,
				start_at: null,
				end_at: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			}),
		],
	},
	benigno: {
		status: 200,
		body: [
			AnnouncementSchema.parse({
				id: "a0000000-0000-4000-8000-0000000000e1",
				title: "Mantenimiento esta noche",
				body: "El servicio vuelve a las 23:00.",
				severity: "info",
				audience_kind: "all",
				priority: 5,
				active: true,
				start_at: null,
				end_at: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			}),
		],
	},
};

/** Variable del proceso, no un argumento: el stub se levanta una vez por suite. */
let announcementsMode: AnnouncementsMode =
	(process.env.STUB_ANNOUNCEMENTS_MODE as AnnouncementsMode | undefined) ??
	"caido";

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

		// ── El control del stub, y por qué NO es una ruta de la API ─────────────
		// Vive FUERA de `/api/v1` a propósito, y solo en loopback: cambia qué
		// contesta este stub, no escribe nada y nunca reenvía. Un test la usa para
		// poner los avisos en el estado que necesita y después la devuelve al
		// default — el default es `caido`, así que cualquier spec que se olvide
		// de restaurar deja la suite en el estado que ya era seguro.
		if (url.pathname === "/__stub/announcements" && req.method === "POST") {
			const raw: unknown = await req.json().catch(() => null);
			const modo =
				typeof raw === "object" && raw !== null && "mode" in raw
					? (raw as { mode?: unknown }).mode
					: undefined;
			if (modo !== "caido" && modo !== "hostil" && modo !== "benigno") {
				return json({ message: `stub: mode inválido ${String(modo)}` }, 400);
			}
			announcementsMode = modo;
			return json({ mode: announcementsMode });
		}
		if (url.pathname === "/__stub/announcements") {
			return json({ mode: announcementsMode });
		}

		// ── Reads the SSR loaders depend on ──────────────────────────────────
		if (url.pathname === "/api/v1/stats/platform") return json(STATS);
		if (url.pathname === "/api/v1/app-config/public") return json(APP_CONFIG);
		// `null` is a contract-valid "no active offer right now"; the hero card
		// has a designed fallback for it, so this exercises the real empty path
		// instead of a fabricated offer that would need a 40-field stub.
		if (url.pathname === "/api/v1/offers/random") return json(null);
		// El único read que devuelve algo que el operador escribió, y su 503 es el
		// que el loader SSR tiene que absorber sin romper la página.
		if (url.pathname === "/api/v1/announcements") {
			const { status, body } = ANNOUNCEMENTS[announcementsMode];
			return json(body, status);
		}

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
