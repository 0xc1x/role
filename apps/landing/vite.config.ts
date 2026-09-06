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
	"/business-signup",
];

/**
 * Genera robots.txt y sitemap.xml en el outDir del build. El dominio viene de
 * VITE_SITE_URL o de VERCEL_PROJECT_PRODUCTION_URL (Vercel la inyecta en build);
 * sin dominio se omite el sitemap y robots.txt sale sin línea Sitemap.
 */
function seoFiles(): Plugin {
	let outDir = "dist";
	return {
		name: "role-seo-files",
		configResolved(config) {
			outDir = config.build.outDir || "dist";
		},
		closeBundle() {
			const raw =
				process.env.VITE_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
			const site = raw
				? `https://${raw.replace(/\/+$/, "").replace(/^https?:\/\//, "")}`
				: undefined;
			if (!site) {
				console.warn(
					"[seo] sin VITE_SITE_URL/VERCEL_PROJECT_PRODUCTION_URL: no se genera sitemap.xml",
				);
			}
			const robots = [
				"User-agent: *",
				"Allow: /",
				...(site ? [`Sitemap: ${site}/sitemap.xml`] : []),
				"",
			].join("\n");
			const writes = [
				writeFile(path.join(outDir, "robots.txt"), robots),
				site
					? writeFile(
							path.join(outDir, "sitemap.xml"),
							[
								'<?xml version="1.0" encoding="UTF-8"?>',
								'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
								...INDEXABLE_ROUTES.map(
									(route) => `<url><loc>${site}${route}</loc></url>`,
								),
								"</urlset>",
								"",
							].join("\n"),
						)
					: Promise.resolve(),
			];
			mkdir(path.resolve(outDir), { recursive: true })
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
