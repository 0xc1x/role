/**
 * Dependency-free static server for the exported web build.
 *
 * Why this exists instead of `expo start`: the e2e must exercise the same
 * artifact that ships to Vercel (`expo export --platform web`). Expo Router's
 * web output is a single-page app — `vercel.json` rewrites every path to
 * `/index.html` — so a plain file server is not enough, the SPA fallback is
 * part of the contract under test.
 *
 * Run standalone with: node e2e/static-server.mjs [port] [root]
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8082);
const root = resolve(process.argv[3] ?? "dist");

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".webmanifest": "application/manifest+json",
	".map": "application/json; charset=utf-8",
};

function resolveFile(urlPath) {
	// Strip the query/hash: a deep link like /explore?category=x must still
	// resolve to a real file when one exists, and to index.html when it does not.
	const clean = normalize(decodeURIComponent(urlPath.split("?")[0]))
		.replace(/^(\.\.[/\\])+/, "")
		.replace(/^\/+/, "");
	const candidate = resolve(join(root, clean));
	if (!candidate.startsWith(root)) return null;
	try {
		if (statSync(candidate).isFile()) return candidate;
	} catch {
		/* fall through to the SPA fallback */
	}
	return null;
}

const server = createServer((req, res) => {
	const file = resolveFile(req.url ?? "/") ?? join(root, "index.html");
	const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
	res.writeHead(200, {
		"Content-Type": type,
		// The deployed build is content-hashed and immutable; a dev e2e server
		// must not let the browser reuse a stale bundle between runs.
		"Cache-Control": "no-store",
	});
	createReadStream(file).pipe(res);
});

server.listen(port, () => {
	console.log(`serving ${root} on http://127.0.0.1:${port}`);
});
