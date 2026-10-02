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
	// indescifrable. Con tres tests en toda la suite, el paralelismo no compra
	// nada y sí compra una carrera.
	//
	// Mismo argumento y mismo número que en apps/landing/playwright.config.ts:36
	// (`workers: 1`, `fullyParallel: false`). Playwright acota por archivo;
	// acá el límite es por proceso compartido, que es más estricto.
	workers: 1,
	targets: [
		{
			// UN target, no dos. `app.command` es un proceso por target y el
			// readiness se sondea en `app.url`: con dos targets compartiendo
			// `url` (el stub en 3999 y vite en 3101) el runner espera que
			// ambos respondan en 3101 y el del stub nunca llega — falla
			// APP_UNREACHABLE. Y aunque se eligiera uno con `--target`, el otro
			// proceso no existiría, y el POST del signup no tendría stub al que
			// hablarle. `e2e-agent/serve.ts` levanta los dos y hace de readiness
			// la URL del dev server.
			name: "landing",
			engine: web(),
			app: {
				url: "http://127.0.0.1:3101",
				// ── Why readyUrl is NOT app.url here ────────────────────────────
				//
				// El readiness por defecto sondea `app.url` con un presupuesto de
				// 2 s por intento (node_modules/e2e/dist/run/managed-process.js,
				// READY_PROBE_TIMEOUT_MS). El primer SSR de `/` en un dev server
				// de Vite frío tarda MUCHOS más segundos — optimiza deps, compila
				// el server bundle— así que cada intento se aborta por timeout a
				// mitad del render.
				//
				// Eso no es inocuo: el socket abortado deja al SSR de Vite
				// escribiendo a una conexión cerrada ("socket hang up"), Vite lo
				// reporta como error y lo empuja por HMR, y el cliente levanta
				// `<vite-error-overlay>`, que intercepta los clicks. Medido: el
				// test falla con
				//   `<vite-error-overlay></vite-error-overlay> intercepts pointer
				//    events: getByRole("button", name: "Registrarnegocio")`
				// en una app perfectamente sana.
				//
				// `/favicon.ico` lo sirve el middleware estático de Vite: sin
				// SSR, sin deps que optimizar, responde en milisegundos. El
				// probe sigue probando lo que tiene que probar —que el dev
				// server está escuchando en 3101— sin destruir su propia
				// readiness. `app.url` queda intacto: es la base de `app.open()`
				// y la que los tests asertan.
				readyUrl: "http://127.0.0.1:3101/favicon.ico",
				// ── ESTA SUITE Y `playwright.config.ts` COMPARTEN PUERTOS ───────
				//
				// 3101 y 3999 son los MISMOS que usa
				// `apps/landing/playwright.config.ts:26-27`, con los mismos
				// defaults y sin variable de entorno que los separe. Las dos
				// suites no pueden correr a la vez en esta app, y una corrida
				// desde otra worktree se ve igual que un proceso zombi de una
				// corrida anterior (`APP_ALREADY_RUNNING`, `EADDRINUSE`).
				//
				// Es una limitación CONOCIDA y documentada a propósito, no un
				// descuido pendiente: separar los puertos de esta suite de los de
				// Playwright está parked en el ledger del branch. Consecuencia
				// operativa: una suite por app, y nunca las dos en paralelo.
				command: {
					executable: "bun",
					args: ["e2e-agent/serve.ts"],
					startupTimeout: 180_000,
					// Un preview de otra branch, o uno arrancado con el
					// VITE_API_URL de producción del shell, no se puede reusar:
					// desde afuera son idénticos. Mismo argumento y mismo
					// `false` que en apps/landing/playwright.config.ts:56-62.
					reuseExisting: false,
					log: ".e2e/logs/landing.log",
				},
			},
		},
	],
} satisfies E2EConfig;
