import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

import { DEFAULT_API_URL, resolveApiUrl } from "./src/config/api-url.ts";

/**
 * ─── `commons` se resuelve desde el SOURCE en dev, no desde `dist` ──────────
 *
 * `packages/commons` es un paquete de workspace: su `exports` apunta a
 * `dist/index.js`, y `dist` es un artefacto que se reconstruye aparte. Si el dev
 * server consume ese `dist`, el servidor queda sirviendo una COPIA del contrato
 * que quedó congelada en el momento en que Vite pre-bundló el paquete — y Vite
 * no vuelve a mirarla: la optimización de dependencias sólo se recalcula cuando
 * cambian el lockfile o la config, no cuando cambia el contenido de un paquete
 * enlazado.
 *
 * MEDIDO: con `optimizeDeps.include: ["@0xc1x/role-commons"]` y un `dist`
 * desactualizado, el navegador moría con
 * `does not provide an export named 'RevokeBusinessAccessResponseSchema'` en
 * TODAS las rutas —incluido `/login`— porque el route tree importa estáticamente
 * cada archivo de ruta. Y como el bundle del cliente moría antes de hidratar,
 * el `<form>` de login caía al submit NATIVO del navegador (GET): la contraseña
 * acababa en la URL (`/login?email=…&password=…`), en el historial y en los logs
 * del servidor. Un solo fallo de caché rompía el panel entero y filtraba
 * credenciales.
 *
 * Resolver desde el source elimina la clase de bug: no hay copia que pueda
 * quedar vieja, y un cambio de contrato se ve en el panel sin reconstruir
 * `commons`. El alias se aplica SÓLO en `serve` —el build de producción sigue
 * consumiendo el paquete publicado (`dist`), que es lo que se despliega—.
 */
function resolveCommonsSrc(): string {
	return fileURLToPath(
		new URL("../../packages/commons/src/index.ts", import.meta.url),
	);
}

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

const config = defineConfig(({ mode, command }) => {
	checkApiUrl(mode);

	return {
		resolve: {
			tsconfigPaths: true,
			// Array form: Vite pasa `resolve.alias` al plugin de alias de Rollup,
			// que sólo entiende la forma `{ find, replacement }` en array. La forma
			// objeto (`{ "@0xc1x/role-commons": … }`) trata el valor como
			// `replacement` literal, y un objeto ahí produce un id roto.
			alias:
				command === "serve"
					? [
							{
								find: "@0xc1x/role-commons",
								replacement: resolveCommonsSrc(),
							},
						]
					: [],
		},
		server: {
			// WSL: sin esto Vite queda atado a ::1 y Windows no lo ve.
			host: true,
			watch: {
				usePolling: true,
			},
		},
		optimizeDeps: {
			// El paquete se resuelve al source (ver `resolve.alias`): no hay nada
			// que pre-bundlear, y una copia pre-bundlada es justo lo que quedó
			// vieja. `exclude` evita que el optimizador intente empaquetarlo.
			exclude: ["@0xc1x/role-commons"],
		},
		build: {
			rollupOptions: {
				output: {
					/**
					 * WHY: Nitro's server build puts every `node_modules` module into
					 * shared chunks named after ONE of their package names
					 * (`codeSplitting.groups` in `nitro/dist/_build/rolldown.mjs` →
					 * `libChunkName`). Rolldown was choosing `@tanstack/devtools` as that
					 * name, so `clsx` was swept into the devtools chunk and re-exported
					 * from it (`export { TanStackDevtoolsCore, clsx }`). `button.tsx`
					 * imports `clsx` from `@/lib/utils`, so EVERY SSR request evaluated the
					 * devtools bundle, which calls a client-only API at module scope.
					 *
					 * MEASURED, before this line: `vite build` + `vite preview` returned
					 * HTTP 500 `Client-only API called on the server side` on every route
					 * including `/login`, and `node .output/server/index.mjs` — the command
					 * Nitro itself prints as the preview command — 500'd identically. The
					 * production build of the admin panel did not boot at all.
					 *
					 * `manualChunks` does NOT work here: rolldown prints
					 * `manualChunks option is ignored because the codeSplitting option is
					 * specified.` `codeSplitting.groups` is matched in order, so claiming
					 * `clsx` in a group BEFORE the catch-all node_modules group keeps it in
					 * a chunk of its own and severs the edge.
					 */
					codeSplitting: {
						groups: [
							{ test: /node_modules[/\\]clsx[/\\]/, name: "_libs/clsx.mjs" },
						],
					},
				},
			},
		},
		plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
	};
});

export default config;
