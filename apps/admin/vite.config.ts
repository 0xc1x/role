import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

import { DEFAULT_API_URL, resolveApiUrl } from "./src/config/api-url.ts";

/**
 * ─── La configuración se valida ANTES de que arranque el servidor ───────────
 *
 * Este es el punto más temprano del proceso en el que se puede leer la variable,
 * y por lo tanto el único lugar donde un valor roto puede morir con un mensaje
 * que el operador lee, en vez de convertirse en un `500 {"message":"HTTPError"}`
 * por ruta.
 *
 * Medido antes del fix: con `VITE_API_URL=not-a-url` el `ZodError` saltaba al
 * cargar el módulo de la app, Vite levantaba igual, y `GET /` y `GET /negocios`
 * respondían 500 con un body pelado. El error real solo existía en el stdout del
 * dev server, así que desde el navegador un panel mal configurado era
 * indistinguible de un panel roto. Esto es una trampa de diagnóstico, no un
 * detalle de robustez.
 *
 * `loadEnv` lee los `.env` igual que el runtime, así que el override por
 * variable de entorno del e2e (`VITE_API_URL=… vite dev`) sigue mandando: la
 * validación usa exactamente la misma resolución que la app.
 */
function checkApiUrl(mode: string) {
	const env = loadEnv(mode, process.cwd(), "VITE_");
	const { usedDefault } = resolveApiUrl(env.VITE_API_URL);

	if (usedDefault) {
		console.warn(
			`[admin] VITE_API_URL no está definida: usando ${DEFAULT_API_URL} por defecto.`,
		);
	}
}

const config = defineConfig(({ mode }) => {
	checkApiUrl(mode);

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
		plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
	};
});

export default config;
