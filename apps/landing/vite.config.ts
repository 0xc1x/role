import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { apiUrlStartupError } from "./src/lib/api-url.ts";
import {
	buildRobotsTxt,
	buildSitemapXml,
	resolveSeoSiteUrl,
} from "./src/lib/seo-files";

/**
 * Genera robots.txt y sitemap.xml en publicDir al construir: nitro copia esa
 * carpeta a .output/public y también quedan servidos en dev. El dominio viene
 * de VITE_SITE_URL o de VERCEL_PROJECT_PRODUCTION_URL (Vercel la inyecta en
 * build); sin dominio se usa https://role.app como fallback con un warning
 * ruidoso para no emitir nunca un robots.txt sin línea Sitemap.
 * /business-signup es noindex y por eso no entra al sitemap.
 *
 * Los dos archivos son artefactos: están en .gitignore y se regeneran en cada
 * build, para que un preview nunca anuncie el origen de producción. La lógica
 * vive en src/lib/seo-files.ts para que `bun test src` la pueda verificar.
 */
function seoFiles(): Plugin {
	let publicDir = "public";
	return {
		name: "role-seo-files",
		configResolved(config) {
			publicDir = config.publicDir || "public";
		},
		closeBundle() {
			const raw =
				process.env.VITE_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
			const site = resolveSeoSiteUrl(raw);
			if (!raw?.trim()) {
				console.warn(
					"[seo] falta VITE_SITE_URL/VERCEL_PROJECT_PRODUCTION_URL: usando fallback https://role.app para robots.txt y sitemap.xml",
				);
			}
			const writes = [
				writeFile(path.join(publicDir, "robots.txt"), buildRobotsTxt(site)),
				writeFile(path.join(publicDir, "sitemap.xml"), buildSitemapXml(site)),
			];
			mkdir(path.resolve(publicDir), { recursive: true })
				.then(() => Promise.all(writes))
				.catch((err) => {
					console.warn("[seo] no se pudieron escribir robots/sitemap:", err);
				});
		},
	};
}

/**
 * El destino de la API se valida al ARRANCAR del dev server, no en la primera
 * request.
 *
 * POR QUÉ acá y no solo en `src/lib/env.ts`: los loaders de cada ruta se tragan
 * su propio fallo (`.catch()`), así que sin la var la landing levantaba igual
 * —200, con el hero en "—" y los emails de fallback— y el error real aparecía
 * unas líneas más abajo del log del server, si aparecía. Con el check en el
 * proceso de arranque, `bun run dev` muere al instante y con el mismo mensaje
 * que el server de producción.
 *
 * `command === "serve"`: el build NO se valida a propósito. CI compila sin la
 * var (paso `Build` de .github/workflows/ci.yml) y el bundle de cliente se
 * arma con la env de Vercel; atar el build a una var rompería ambos. El destino
 * solo importa cuando algo corre y hace una petición, y eso es `serve` (local)
 * o el server ya construido (producción, que valida `env.ts`).
 *
 * `process.env` va primero porque en Vite el env de proceso le gana al archivo
 * `.env`; es el mismo orden que usa Vite al resolver `import.meta.env`.
 */
function assertApiUrlConfigured(
	command: string,
	root: string,
	mode: string,
): void {
	if (command !== "serve") return;
	const fromFile = loadEnv(mode, root, "VITE_");
	const error = apiUrlStartupError(
		process.env.VITE_API_URL ?? fromFile.VITE_API_URL,
	);
	if (error) throw error;
}

const config = defineConfig(({ command, mode }) => {
	assertApiUrlConfigured(command, process.cwd(), mode);

	return {
		resolve: { tsconfigPaths: true },
		server: {
			watch: {
				usePolling: true,
			},
		},
		optimizeDeps: {
			include: ["@0xc1x/role-commons"],
		},
		plugins: [
			devtools(),
			nitro(),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
			seoFiles(),
		],
	};
});

export default config;
