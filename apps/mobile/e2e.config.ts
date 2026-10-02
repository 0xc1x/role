import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

export default {
	output: ".e2e",
	tests: "e2e-agent/**/*.e2e.ts",
	// Sin modelo en esta fase, el replay cache no tiene nada que guardar.
	cache: "off",
	// Un worker, y no el default. El server estático es UN proceso, arrancado
	// una vez por corrida y compartido por todos los workers: en paralelo, dos
	// tests medirían el mismo buffer de Resource Timing del mismo documento a la
	// vez. Con un test en toda la suite, el paralelismo no compra nada y sí compra
	// una carrera.
	//
	// Y la comparación con la suite hermana NO es "mismo número que allá": el
	// `playwright.config.ts` de mobile no pone `workers` (verificado), así que
	// hereda el del config raíz, que es `process.env.CI ? 1 : undefined`
	// (`playwright.config.ts:46`) — o sea 1 en CI y el default de Playwright
	// (la mitad de los cores) local. Acá el 1 es INCONDICIONAL y por una razón
	// distinta y más estricta que la de cualquier cap por carga: el estado que no
	// se puede compartir es el documento, no la CPU. `apps/landing/playwright.config.ts:36`
	// sí fija `workers: 1` local; ese es el espejo numérico, no el de mobile.
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
					// se dimensiona contra el PEOR tiempo medido, no el típico.
					//
					// MEDIDO en esta máquina, `bun run export:web` en frío con este
					// flujo, `--clear` (que borra el cache de Metro, así que cada
					// corrida es fría de verdad) y las seis dummies de
					// `EXPO_DUMMIES`:
					//
					//   | corrida | wall  | resultado                    |
					//   |----------|-------|-----------------------------|
					//   | 1        | 206 s | exit 0                      |
					//   | 2        | 205 s | exit 0                      |
					//   | 3        | 210 s | exit 0                      |
					//   | 4        | 211 s | exit 0                      |
					//   | 5        | 282 s | exit 0                      |
					//   | 6        | 270 s | exit 0                      |
					//   | 7        | 320 s | exit 1 — ENOMEM en saveAssets |
					//
					// El rango es de 206 a 320 s: casi 1.6x de dispersión sobre el
					// mismo comando. Por eso 600 s y no 300 s: el peor caso medido
					// deja 280 s de aire, y un runner de CI puede ser más lento que
					// esta caja. Con 300 s el caso de 320 s no habría imports: el
					// runner cortaría la corrida y reportaría
					// `APP_UNREACHABLE … was not reachable at <readyUrl> within
					// 300000 ms` —es decir, "el server nunca arrancó" cuando la
					// verdad es "el export se pasó de tiempo", que es exactamente
					// la clase de fallo engañoso que el diseño de `shutdown()` de
					// los tres `serve.ts` existe para evitar.
					//
					// OJO con el ENOMEM de la corrida 7: ese NO lo arregla un
					// presupuesto más grande, porque no es un problema de tiempo sino
					// de memoria —`@expo/cli/src/export/assets/saveAssets.js:245`
					// se queda sin memoria al volcar los assets del bundle de 8.1 MB
					//—. Lo que este presupuesto sí garantiza para ese caso es que
					// cuando la memoria falta, el export MUERE con su código y
					// `shutdown(code)` lo propaga, así que el runner reporta el fallo
					// del export y no un readiness de un server sano. El remedio
					// del ENOMEM es memoria (o menos carga concurrente en la caja),
					// no timeout.
					//
					// Lo que el presupuesto NO tiene que cubrir es el export lento
					// POR LA COLA DE LA MÁQUINA: esa la resuelve el pre-flight de
					// puerto en `serve.ts`, que falla en segundos en vez de dejar
					// que este número corra.
					startupTimeout: 600_000,
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
