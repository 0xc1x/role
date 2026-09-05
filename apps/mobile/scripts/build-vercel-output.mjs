/**
 * Ensambla `.vercel/output` (Build Output API v3) desde `dist/` para
 * `vercel deploy --prebuilt` — mismo flujo que apps/landing.
 *
 * `vercel.json` sigue siendo la fuente de verdad: sus `headers` y `rewrites`
 * se traducen a las `routes` del config.json (headers antes del filesystem,
 * rewrites después — misma semántica que tiene Vercel al evaluarlos).
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const output = join(root, ".vercel", "output");

if (!existsSync(dist)) {
	console.error(
		"[build-vercel-output] ✗ Falta dist/ — corré `bun run export:web` primero.",
	);
	process.exit(1);
}

const vercelJson = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

const headerRoutes = (vercelJson.headers ?? []).map((h) => ({
	src: h.source,
	headers: Object.fromEntries(h.headers.map(({ key, value }) => [key, value])),
}));
const rewriteRoutes = (vercelJson.rewrites ?? []).map((r) => ({
	src: r.source,
	dest: r.destination,
}));

const config = {
	version: 3,
	routes: [...headerRoutes, { handle: "filesystem" }, ...rewriteRoutes],
};

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "static"), { recursive: true });
cpSync(dist, join(output, "static"), { recursive: true });
writeFileSync(
	join(output, "config.json"),
	`${JSON.stringify(config, null, "\t")}\n`,
);
console.log(
	`[build-vercel-output] OK → .vercel/output (static + ${config.routes.length} routes)`,
);
