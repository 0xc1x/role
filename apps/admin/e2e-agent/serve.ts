/**
 * Comando del único target de la suite `e2e` (tester.army) de admin.
 *
 * ─── Por qué un target y no dos ────────────────────────────────────────────
 *
 * `app.command` es UN proceso por target y el readiness se sondea en
 * `readyUrl`. El stub (4110) y el server (3110) no pueden ser dos targets con
 * la misma URL: el runner levanta los targets en paralelo y espera que TODOS
 * respondan, así que el target del stub nunca se vuelve alcanzable en 3110
 * (APP_UNREACHABLE, comprobado en landing). Y aunque se eligiera uno con
 * `--target`, el otro proceso no existiría: el login del panel es una
 * `createServerFn`, así que sin stub no hay a quién POSTear `/auth/login`.
 *
 * El contraste con `apps/admin/playwright.config.ts` es instructivo: esa suite
 * SÍ usa dos `webServer`, porque Playwright asocia cada uno a un puerto PROPIo
 * en vez de a una URL compartida. `e2e` asocia el readiness a la URL.
 *
 * ─── Por qué `vite preview` (con build) y no `vite dev` ─────────────────────
 *
 * `playwright.config.ts:72-97` ya decidió esto para el admin y lo medido: el
 * dev server serializa cada render SSR por un único proceso Node (a 8 workers
 * la mediana por test era 19.8 s contra 14.4 s de `preview`), y `preview`
 * sirve el ARTEFACTO que se despacha — probar el bundle de dev es probar otro
 * programa. Para el runner `e2e` hay además un motivo propio y BLOQUEANTE,
 * medido en este repo con este flujo:
 *
 *   | servidor      | entradas en Resource Timing | entradas `/api/v1` |
 *   |---------------|------------------------------|---------------------|
 *   | vite dev      | 250 (LLENO, el tope)         | 0 — EVICTADAS       |
 *   | vite preview  | 77                           | 5 — las 5 de 4110   |
 *
 * El tope del buffer de Resource Timing (250 en Chromium) no es circular, y en
 * `dev` lo llenan las peticiones del grafo de módulos; las de la API son las
 * últimas de la página, así que son las que se descartan. La aserción de
 * destino — la que hace segura esta suite — no se puede escribir contra `dev`:
 * no daría verde por estar bien, daría verde por no ver nada. Ese detalle
 * está razonado en el test (`auth-gate.e2e.ts`) para que el cambio de decisión
 * no se reintroduzca por olvidadizo.
 *
 * El build va AQUÍ, y no en el `command` del config con `&&`, por dos razones
 * concretas: `sh -c` no existe en Windows (donde se desarrolla este repo), y
 * un `&&` en una cadena también escondería el código de salida del build
 * detrás del del preview. Acá el build es un paso con su propio exit code: si
 * falla, este proceso sale con ese código y el runner lo reporta con el log.
 *
 * ─── Reglas que este script no puede romper ────────────────────────────────
 *
 * - El stub NUNCA proxea: un path desconocido es 404, no un forward.
 * - `VITE_API_URL` va por env de proceso, que en Vite gana sobre `.env` (que
 *   apunta a `localhost:4001`, la API real) — y hay que pasarlo en el build Y
 *   en el preview, porque `preview` corre un bundle donde la variable ya quedó
 *   sustituida por el valor literal.
 * - `ADMIN_E2E_STUB_PORT` es el nombre que `e2e/stub-api.ts:96` lee de verdad
 *   (`process.env.ADMIN_E2E_STUB_PORT ?? 4110`); el default ya es 4110, pero se
 *   pasa explícito para que el puerto de la suite no dependa de ese default.
 */
import path from "node:path";

const STUB_API_PORT = "4110";
const UI_PORT = "3110";
const STUB_API_URL = `http://127.0.0.1:${STUB_API_PORT}/api/v1`;

// El project root (donde vive vite.config.ts y e2e/stub-api.ts) es el padre de
// este archivo. No se usa `process.cwd()`: este script puede invocarse desde
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
		// lanza `node .../vite`, y ese node es quien realmente escucha en 3110.
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
		shutdown();
	});
	return child;
}

/**
 * Mata el ÁRBOL de un hijo, no solo el proceso que lo lanzó.
 *
 * POR QUÉ hace falta: `child.kill()` le manda una señal a UN pid. El pid de
 * `bunx vite` no es el que tiene el socket en 3110 — lo tiene el `node` que
 * `bunx` lanzó. Si ese node sobrevive, el puerto 3110 queda tomado y la
 * corrida siguiente muere con `APP_ALREADY_RUNNING`. Ese es el peor de los dos
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
 * Mata todos los hijos registrados. Sin `exit`: cada llamador decide con qué
 * código termina el proceso, y esa decisión es la que se pierde si el `exit`
 * vive adentro.
 */
function killAll() {
	for (const child of children) killTree(child);
}

let closing = false;
function shutdown() {
	if (closing) return;
	closing = true;
	killAll();
	process.exit(0);
}

// El runner signala el grupo del PROPIO serve.ts (`detached` en
// managed-process.js:171), que en win32 es solo este proceso. Estos handlers
// son la capa que mata a los nietos: sin ellos, en Windows el shutdown depende
// únicamente de la rama de arriba.
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Última línea de defensa: si el runner mata el proceso sin que corra el
// handler (SIGKILL, o una muerte abrupta del grupo), `exit` todavía se dispara
// en el Bun padre. Con `detached: true` los hijos ya están en otros grupos, así
// que sobreviven a que nosotros muramos — por eso hay que cazarlos también
// desde acá.
process.on("exit", () => {
	for (const child of children) killTree(child);
});

/**
 * El build, como paso explícito y NO como hijo de larga vida.
 *
 * No usa `spawn()` a propósito: `spawn` ata un `shutdown()` al `exited` del
 * hijo, y un build que termina bien — que es lo que pasa SIEMPRE que todo esté
 * bien — tiraría la suite abajo. Acá se espera el código de salida y se decide:
 * éxito sigue, fallo apaga el otro proceso y propaga el código. Un build rojo
 * tiene que ser un target rojo y ruidoso, no un preview sirviendo un `dist/`
 * viejo que hace pasar la suite contra código que nadie probó.
 */
async function build(): Promise<void> {
	console.error("[e2e target] construyendo el bundle de admin (vite build)…");
	// `detached` TAMBIÉN acá, aunque el build sea un paso síncrono. No por el
	// servidor, sino por `killTree`: la rama POSIX hace `kill(-pid)`, y eso
	// solo es el grupo del hijo si el hijo lo|leader|. Sin `detached`, `bun run
	// build` corre en el grupo de serve.ts, así que `kill(-pid)` no toca su
	// subárbol — y `bun run build` es un shim que a su vez lanza `vite build`:
	// el que escribe en `.output/` es el nieto. Un SIGTERM al shim deja al
	// vite escribiendo el bundle mientras la corrida siguiente ya está
	// compilando encima.
	//
	// Y el `children.push` de un proceso YA terminado sería peor que inútil:
	// cuando el runner corta la corrida en la fase de test, el handler de
	// `exit` recorre `children` y le manda `kill(-pid)` a un pid que puede
	// haber sido reciclado por otro proceso del sistema. Un SIGTERM a un grupo
	// ajeno, con el build verde y la suite en verde. Por eso `build` mantiene
	// su propia lista y solo se registra mientras el build corre.
	const buildChildren: Bun.Subprocess[] = [];
	const proc = Bun.spawn(["bun", "run", "build"], {
		cwd: PROJECT_ROOT,
		env: { ...process.env, VITE_API_URL: STUB_API_URL },
		stdout: "inherit",
		stderr: "inherit",
		detached: true,
	});
	buildChildren.push(proc);
	// El runner puede cortar la corrida DURANTE el build (el presupuesto de
	// `startupTimeout` corre desde el spawn). Sin esto, `bun run build` y su
	// nieto quedan huérfanos compilando un bundle que nadie va a servir.
	//
	// Un flag en vez de `process.once`/`process.off`: `off` no está bien
	// tipado en `bun-types` (el overload resuelve a otro evento y
	// `tsc --noEmit` lo rechaza), y desregistrar a mano además es la clase de
	// detalle que se olvida. Con el flag, el handler queda registrado para
	// siempre y simplemente no hace nada cuando el build ya terminó.
	let buildRunning = true;
	process.on("exit", () => {
		if (!buildRunning) return;
		for (const child of buildChildren) killTree(child);
	});

	const code = await proc.exited;
	// El build ya terminó: su pid no nos pertenece más y `killAll()` —ni este
	// handler— no debe señalarlo.
	buildRunning = false;
	buildChildren.length = 0;

	if (code !== 0) {
		console.error(
			`[e2e target] vite build falló (code=${code}); no se arranca vite preview`,
		);
		// NO `shutdown()`: ese helper hace `process.exit(0)`, y llamarlo acá
		// convertiría un build rojo en un target que "terminó bien" — el
		// `process.exit(code)` de abajo quedaba muerto, inalcanzable. El runner
		// lee 0 y reporta `exited (code 0) before becoming ready`, que manda a
		// leer un target sano cuando el problema era el bundle. Un build roto
		// tiene que salir con el código del build para que el mensaje diga eso.
		closing = true;
		killAll();
		process.exit(code ?? 1);
	}
	console.error("[e2e target] build ok; arrancando vite preview");
}

spawn("stub-api", ["bun", "e2e/stub-api.ts"], {
	ADMIN_E2E_STUB_PORT: STUB_API_PORT,
});

await build();

// El preview sirve el bundle que el build acaba de hacer con
// `VITE_API_URL=http://127.0.0.1:4110/api/v1` ya sustituido dentro, así que el
// env del proceso se repite solo por simetría con `dev` y para que el log del
// target diga de dónde salió el destino.
spawn("vite-preview", ["bunx", "vite", "preview", "--port", UI_PORT, "--host", "127.0.0.1"], {
	VITE_API_URL: STUB_API_URL,
});