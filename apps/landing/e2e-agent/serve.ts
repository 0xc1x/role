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
		// Cada hijo en su PROPIO grupo de procesos. Sin esto, matar al hijo
		// directo no alcanza a sus nietos: `bunx vite` es un shim que a su vez
		// lanza `node .../vite`, y ese node es quien realmente escucha en 3101.
		// `detached` lo que hace es crear ese grupo, que es lo que después
		// permite matar al ÁRBOL entero y no solo al proceso de la superficie.
		detached: true,
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
		// El código del hijo se propaga, y NO se aplana a 0. Un hijo de larga
		// vida que se muere es el target fallando, y el runner necesita el
		// código para decir POR QUÉ.
		//
		// MEDIDO en el par de admin (`apps/admin/e2e-agent/serve.ts`), con 3999
		// equivalente ocupado por un proceso ajeno: el hijo moría con `code=1` y
		// `EADDRINUSE`, pero como este handler llamaba a `shutdown()` —que hace
		// `process.exit(0)`— el runner recibía 0 y reportaba
		//     `target "landing" command exited with code 0 before becoming ready`
		// que manda a leer el readiness de un target sano, con la causa real
		// abajo solo en el log. Y el puerto del stub NO tiene la pre-verificación
		// que sí tiene el de la UI: el runner solo sondea `readyUrl`
		// (managed-process.js:141-147), así que una colisión ahí es
		// precisamente el caso que este código tiene que reportar bien.
		shutdown(code ?? 1);
	});
	return child;
}

/**
 * Mata el ÁRBOL de un hijo, no solo el proceso que lo lanzó.
 *
 * POR QUÉ hace falta: `child.kill()` le manda una señal a UN pid. El pid de
 * `bunx vite` no
 * es el que tiene el socket en 3101 — lo tiene el `node` que `bunx` lanzó. Si
 * ese node sobrevive, el puerto 3101 queda tomado y la corrida siguiente muere
 * con `APP_ALREADY_RUNNING`. Ese es exactamente el fallo que hubo que resolver
 * a mano durante la implementación de esta suite, y es el peor de los dos
 * mundos: no es un test rojo, es un test que la próxima corrida no puede
 * siquiera empezar.
 *
 * `detached: true` (arriba) es la mitad POSIX de la solución: el hijo es líder
 * de su grupo, así que `kill(-pid)` alcanza a todo el grupo — el shim Y el node.
 *
 * En win32 NO existe la señal de grupo, y `process.kill(-pid)` no tiene
 * equivalente: los pids negativos no significan nada allí. La herramienta
 * propia de Windows para esto es `taskkill /T`, donde `/T` es justamente
 * "terminate this process AND the processes it started" — el equivalente
 * nativo de `kill(-pid)`. `/F` fuerza el cierre, sin el cual Vite ignora el
 * primer pedido y el puerto sigue ocupado. Este repo se desarrolla en Windows,
 * así que la rama de win32 no es decorativa: es la plataforma donde la suite
 * nació y donde este bug se sintió primero.
 */
function killTree(child: Bun.Subprocess): void {
	const pid = child.pid;
	if (pid === undefined) return;
	try {
		if (process.platform === "win32") {
			Bun.spawnSync({
				cmd: ["taskkill", "/PID", String(pid), "/T", "/F"],
				stdout: "ignore",
				stderr: "ignore",
			});
		} else {
			// El grupo del hijo, no el nuestro: con `detached: true` su pgid
			// es su propio pid, así que el signo menos lo alcanza sin tocar
			// al runner.
			process.kill(-pid, "SIGTERM");
		}
	} catch {
		// El grupo ya no existe, o el permiso no alcanza: cae al kill directo
		// del hijo, que es mejor que no limpiar nada.
		try {
			child.kill();
		} catch {
			// Ya estaba muerto.
		}
	}
}

/**
 * Cierra el target y SALE con `code`.
 *
 * `code` es un parámetro y no una constante porque las rutas de salida necesitan
 * decir cosas distintas, y aplanarlas todas a 0 es lo que hace que un fallo se
 * reporte como un target sano:
 *
 *   | ruta                        | code                       |
 *   |-----------------------------|----------------------------|
 *   | SIGINT / SIGTERM del runner | 0 — parada ordenada        |
 *   | hijo de larga vida muerto   | el del hijo (`code ?? 1`)  |
 *
 * `code ?? 1` y no `code ?? 0`: un hijo muerto por señal resuelve `code=null`,
 * y `null` no es un motivo para reportar una salida exitosa.
 */
let closing = false;
function shutdown(code = 0) {
	if (closing) return;
	closing = true;
	for (const child of children) killTree(child);
	process.exit(code);
}

// El runner signala el grupo del PROPIO serve.ts (`detached` en
// managed-process.js:171), que en win32 es solo este proceso. Estos handlers
// son la capa que mata a los nietos: sin ellos, en Windows el shutdown depende
// únicamente de la rama de arriba.
//
// ─── ALCANCE REAL DE ESTOS HANDLERS, POR PLATAFORMA ────────────────────────
//
// Son la RED DE SEGURIDAD, y no la vía principal. En POSIX corren de verdad: el
// runner manda SIGTERM al grupo, el handler dispara el `killTree` de cada hijo,
// y los nietos (`bunx` → `node vite`) mueren. Verificado en esta máquina.
//
// En win32 CORREN, pero solo si el proceso alcanza a despacharlos antes de morir,
// y ahí está el problema: `managed-process.js:41-45` degrada
// `signalProcessGroup` a `child.kill(signal)`, y en Node/Bun sobre Windows
// `child.kill("SIGTERM")` es un `TerminateProcess` — una Terminación INMEDIATA,
// sin cola de señales, sin handlers de JS. Un `TerminateProcess` tampoco
// dispara el handler de `exit`.
//
// Consecuencia honesta, que no se puede evitar desde adentro del proceso que
// está siendo terminado: cuando la parada la inicia el runner en win32, estos
// handlers probablemente NO llegan a correr, y con ellos se cae la única cosa
// que dispara `taskkill /T /F`. La rama de win32 de `killTree` sigue siendo
// alcanzable, pero por las OTRAS dos entradas — un hijo que se muere solo, que
// es el caso MEDIDO en el par de admin — y no por la parada ordenada.
//
// Lo que NO se claims: que la rama de win32 esté verificada. No lo está, y no
// se puede verificar desde una caja Linux. Verificarlo requiere una corrida real
// en Windows mirando el árbol de procesos antes y después. Mismo alcance, mismo
// límite y mismo texto que en `apps/admin/e2e-agent/serve.ts`: los dos archivos
// son un par espejado y no tiene sentido que uno afirme más que el otro.
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Última línea de defensa: si el runner mata el proceso sin que corra el
// handler (SIGKILL, o una muerte abrupta del grupo), `exit` todavía se dispara
// en el Bun padre. Con `detached: true` los hijos ya están en otros grupos, así
// que sobreviven a que nosotros muramos — por eso hay que cazarlos también
// desde acá.
process.on("exit", () => {
	for (const child of children) killTree(child);
});

spawn("stub-api", ["bun", "e2e/stub-api.ts"], { STUB_API_PORT });
spawn("vite", ["bunx", "vite", "dev", "--port", UI_PORT, "--host", "127.0.0.1"], {
	VITE_API_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
});
