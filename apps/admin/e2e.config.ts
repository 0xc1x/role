import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	// Sin modelo en esta fase, el replay cache no tiene nada que guardar.
	cache: "off",
	// Un worker, y no el default (la mitad de los cores fuera de CI). El dev
	// server y el stub son UN proceso cada uno, arrancados una vez por corrida y
	// compartidos por todos los workers: en paralelo, dos tests conducirían el
	// mismo stub a la vez y el conteo de tráfico de cualquiera de los dos sería
	// indescifrable. Con un test en toda la suite, el paralelismo no compra nada
	// y sí compra una carrera.
	workers: 1,
	targets: [
		{
			// UN target, no dos. `app.command` es un proceso por target y el
			// readiness se sondea en `readyUrl`: con dos targets compartiendo la
			// misma URL (el stub en 4110 y el server en 3110) el runner espera que
			// ambos respondan en 3110 y el del stub nunca llega — falla
			// APP_UNREACHABLE. Y aunque se eligiera uno con `--target`, el otro
			// proceso no existiría, y el login del panel (una `createServerFn`)
			// no tendría stub al que POSTear `/auth/login`.
			// `e2e-agent/serve.ts` levanta los dos —y compila el bundle— y hace
			// de readiness la URL del preview.
			name: "admin",
			engine: web(),
			app: {
				url: "http://127.0.0.1:3110",
				// ── Why readyUrl is NOT app.url here ────────────────────────────
				//
				// El readiness por defecto sondea la URL con un presupuesto de
				// 2 s por intento (node_modules/e2e/dist/run/managed-process.js,
				// READY_PROBE_TIMEOUT_MS). MEDIDO acá, con `bun run build` delante
				// del preview: `/` tarda 8.16 s en responder la primera vez y 44 s
				// en la segunda (compila el server bundle y resuelve el grafo de
				// SSR). Cada intento se abortaría por timeout a mitad del render.
				//
				// Y abortar no es inocuo: el socket cerrado deja al SSR
				// escribiendo a una conexión muerta ("socket hang up"), Vite lo
				// reporta como error, lo empuja por HMR, y el cliente levanta
				// `<vite-error-overlay>`, que intercepta los clicks. Medido en
				// landing: el test falla con
				//   `<vite-error-overlay></vite-error-overlay> intercepts pointer
				//    events: getByRole("button", name: "Registrar negocio")`
				// en una app perfectamente sana. El probe fabrica el error.
				//
				// `/favicon.ico` lo sirve el middleware estático: sin SSR, sin
				// deps que optimizar, responde en milisegundos (medido: 0.53 s
				// incluso con `curl` en frío, y <1 s en caliente). El probe sigue
				// probando lo que tiene que probar —que el server está
				// escuchando en 3110— sin destruir su propia readiness.
				// `app.url` queda intacto: es la base de `app.open()` y la que
				// los tests asertan.
				readyUrl: "http://127.0.0.1:3110/favicon.ico",
				command: {
					executable: "bun",
					args: ["e2e-agent/serve.ts"],
					// El presupuesto es para el BUILD, no solo para el preview, y
					// MEDIDO en esta máquina con este flujo: 163 s en la primera
					// corrida en frío de la sesión (tres passes de `vite build` —
					// 24 s, 15 s y 20 s— más el plugin de nitro) y 96 s en la
					// siguiente, con `.output/` ya tibio. El default del runner es
					// 30 s, que cortaría la corrida antes de que el target llegue a
					// existir; el segundo número muestra que 300 s es holgado para
					// lo tibio y necesario para lo frío.
					startupTimeout: 300_000,
					// Un preview de otra branch, o uno booted con el
					// VITE_API_URL de producción del shell, no se puede reusar:
					// desde afuera son idénticos. Mismo argumento y mismo `false`
					// que en apps/admin/playwright.config.ts:105-106 — donde el
					// default de Playwright (`!process.env.CI`) reusaría uno en
					// la máquina del dev, que es justo donde el `.env` apunta a
					// la API real.
					reuseExisting: false,
					log: ".e2e/logs/admin.log",
				},
			},
		},
	],
} satisfies E2EConfig;
