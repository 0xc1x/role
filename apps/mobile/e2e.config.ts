import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	// Sin modelo en esta fase, el replay cache no tiene nada que guardar.
	cache: "off",
	// Un worker, y no el default (la mitad de los cores fuera de CI). El server
	// estático es UN proceso, arrancado una vez por corrida y compartido por
	// todos los workers: en paralelo, dos tests medirían el mismo buffer de
	// Resource Timing del mismo documento a la vez. Con un test en toda la suite,
	// el paralelismo no compra nada y sí compra una carrera.
	//
	// Mismo número que en `apps/mobile/playwright.config.ts`, que no fija
	// workers y por lo tanto hereda el default de Playwright; acá la razón es
	// propia y más estricta (un proceso compartido, no un archivo por test).
	workers: 1,
	targets: [
		{
			// UN target, no dos. `app.command` es un proceso por target y el
			// readiness se sondea en `readyUrl`: con dos targets (el export y el
			// server estático, que comparten destino) el runner espera que
			// ambos respondan en 8085 y el del export nunca llega — falla
			// APP_UNREACHABLE, comprobado en landing y admin. Y aunque se
			// eligiera uno con `--target`, el otro proceso no existiría: sin el
			// export no hay `dist/`, y sin el server no hay PWA que abrir.
			// `e2e-agent/serve.ts` levanta los dos, en orden, y hace de
			// readiness la URL del server.
			name: "mobile",
			engine: web(),
			app: {
				url: "http://127.0.0.1:8085",
				// ── Why readyUrl is NOT app.url here ────────────────────────────
				//
				// El readiness por defecto sondea `app.url` con un presupuesto
				// de 2 s por intento (node_modules/e2e/dist/run/managed-process.js,
				// READY_PROBE_TIMEOUT_MS).
				//
				// En landing y admin ese detalle era un problema GRAVE porque su
				// `/` es SSR: un render abortado a mitad de camino dejaba al
				// servidor escribiendo a un socket muerto, Vite lo subía por HMR y
				// el cliente levantaba `<vite-error-overlay>`, que intercepta los
				// clicks. Aquí el riesgo real es otro, y más simple: `/` devuelve
				// el `index.html` de 14 KB, que es un archivo, pero la ruta `/` es
				// también la que el test navega; sondearla de readiness y de
				// destino mezcla los dos papeles.
				//
				// `/favicon.ico` es un archivo estático de 3 KB que `expo export`
				// copia desde `public/` a `dist/` — MEDIDO en esta máquina: el
				// server responde en milisegundos. El probe sigue probando lo
				// que tiene que probar —que el artefacto está en disco y que hay
				// un server escuchando en 8085— sin tocar la ruta que los tests
				// abren. `app.url` queda intacta: es la base de `app.open()` y la
				// que los tests asertan.
				//
				// Una diferencia con las otras dos apps que conviene no perder de
				// vista: acá NO hay timeout de probe que ajustar. El riesgo de
				// este target es el otro — que el export no termine a tiempo— y
				// ese lo cubre `startupTimeout` abajo, no el probe.
				readyUrl: "http://127.0.0.1:8085/favicon.ico",
				command: {
					executable: "bun",
					args: ["e2e-agent/serve.ts"],
					// El presupuesto es para el EXPORT, no solo para el server, y
					// MEDIDO en esta máquina con este flujo: el export en frío, con
					// el cache de Metro vacío ("Bundler cache is empty, rebuilding
					// (this may take a minute)"), tarda del orden de un minuto
					// largo y produce un bundle de 8.1 MB. El default del runner
					// es 30 s, que cortaría la corrida antes de que el target
					// llegue a existir; 300 s es lo que usan los targets de admin y
					// landing, y acá hace falta lo mismo o más: el export es el
					// paso lento y el server posterior arranca en milisegundos.
					startupTimeout: 300_000,
					// Un `dist/` servido por un server de otra branch —o por el
					// de otra worktree, que comparte puerto desde
					// `playwright.config.ts`— no se puede reusar: desde afuera es
					// un server estático idéntico. Mismo argumento y mismo `false`
					// que en apps/mobile/playwright.config.ts:73-75, donde el
					// default de Playwright (`!process.env.CI`) reusaría uno en la
					// máquina del dev.
					reuseExisting: false,
					log: ".e2e/logs/mobile.log",
				},
			},
		},
	],
} satisfies E2EConfig;
