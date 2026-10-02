/**
 * Comando del único target de la suite `e2e` (tester.army) de landing.
 *
 * ─── Por qué un target y no dos ────────────────────────────────────────────
 *
 * `app.command` es UN proceso por target y el readiness se sondea en
 * `app.url`. El stub (3999) y el dev server (3101) no pueden ser dos targets
 * con el mismo `url`: el runner levanta los targets en paralelo y espera que
 * TODOS respondan en su `url`, así que el target del stub nunca se vuelve
 * alcanzable en 3101 (APP_UNREACHABLE, comprobado). Y aunque se eligiera uno
 * con `--target`, el otro proceso no existiría: la páginaSSR hace el POST al
 * stub, así que el flujo de signup no tiene a quién hablarle.
 *
 * El contraste con `apps/landing/playwright.config.ts` es instructive: esa
 * suite SÍ usa dos `webServer`, porque Playwright asocia cada uno a un puerto
 * PROPIO en vez de a una URL compartida. `e2e` asocia el readiness a la URL.
 *
 * ─── Por qué este script y no una línea de shell ────────────────────────────
 *
 * `sh -c "stub & exec vite"` funciona en Linux y macOS, y este repo se
 * desarrolla también en Windows, donde no hay `sh`. Bun.serve no aplica
 * (esto no sirve HTTP): hace falta `Bun.spawn`, que es cross-platform.
 *
 * Reglas que hereda del config y que este script no puede romper:
 * - El stub NUNCA proxea: un path desconocido es 404, no un forward.
 * - `VITE_API_URL` va por env de proceso, que en Vite gana sobre `.env`
 *   (que apunta a un backend de producción real).
 */
import path from "node:path";

const STUB_API_PORT = "3999";
const UI_PORT = "3101";

// El project root (donde vive vite.config.ts y e2e/stub-api.ts) es el padre de
// este archivo. No se usa `process.cwd()`: este script puede ser invocado desde
// cualquier cwd y las rutas relativas de los hijos tienen que ser stably las
// mismas.
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");

const children: Bun.Subprocess[] = [];

function spawn(name: string, cmd: string[], env: Record<string, string>) {
	const child = Bun.spawn(cmd, {
		cwd: PROJECT_ROOT,
		env: { ...process.env, ...env },
		stdout: "inherit",
		stderr: "inherit",
	});
	children.push(child);
	// `exited` resuelve con el exit code solamente (el signal no viene en la
	// promesa de Bun), así que el motivo se separa con `child.signalCode`, que
	// sí lo distingue. Sin esto, un proceso muerto por SIGTERM se reportaría
	// como `code=null` sin decir por qué.
	child.exited.then((code) => {
		console.error(
			`[e2e target] ${name} terminó (code=${code} signal=${child.signalCode}); bajando el otro proceso`,
		);
		shutdown();
	});
	return child;
}

let closing = false;
function shutdown() {
	if (closing) return;
	closing = true;
	for (const child of children) {
		try {
			child.kill();
		} catch {
			// Ya estaba muerto.
		}
	}
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

spawn("stub-api", ["bun", "e2e/stub-api.ts"], { STUB_API_PORT });
spawn("vite", ["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"], {
	VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
});
