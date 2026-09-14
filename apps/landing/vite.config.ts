import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

const INDEXABLE_ROUTES = [
	"/",
	"/how-it-works",
	"/for-business",
	"/help-center",
	"/about",
	"/privacy",
	"/terms",
];

/**
 * Genera robots.txt y sitemap.xml en publicDir al construir: nitro copia esa
 * carpeta a .output/public y también quedan servidos en dev. El dominio viene
 * de VITE_SITE_URL o de VERCEL_PROJECT_PRODUCTION_URL (Vercel la inyecta en
 * build); sin dominio se usa https://role.app como fallback con un warning
 * ruidoso para no emitir nunca un robots.txt sin línea Sitemap.
 * /business-signup es noindex y por eso no entra al sitemap.
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
			const normalized = raw
				? raw.replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://")
				: undefined;
			const site = normalized ?? "https://role.app";
			if (!normalized) {
				console.warn(
					"[seo] falta VITE_SITE_URL/VERCEL_PROJECT_PRODUCTION_URL: usando fallback https://role.app para robots.txt y sitemap.xml",
				);
			}
			const robots = [
				"User-agent: *",
				"Allow: /",
				`Sitemap: ${site}/sitemap.xml`,
				"",
			].join("\n");
			const writes = [
				writeFile(path.join(publicDir, "robots.txt"), robots),
				writeFile(
					path.join(publicDir, "sitemap.xml"),
					[
						'<?xml version="1.0" encoding="UTF-8"?>',
						'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
						...INDEXABLE_ROUTES.map(
							(route) => `<url><loc>${site}${route}</loc></url>`,
						),
						"</urlset>",
						"",
					].join("\n"),
				),
			];
			mkdir(path.resolve(publicDir), { recursive: true })
				.then(() => Promise.all(writes))
				.catch((err) => {
					console.warn("[seo] no se pudieron escribir robots/sitemap:", err);
				});
		},
	};
}

const config = defineConfig({
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
});

export default config;
