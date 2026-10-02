/**
 * Comando del único target de la suite `e2e` (tester.army) de mobile.
 *
 * ─── Por qué un target y no dos ────────────────────────────────────────────
 *
 * `app.command` es UN proceso por target y el readiness se sondea en
 * `readyUrl`. El export (que termina) y el server estático (que no) no pueden
 * ser dos targets: el runner levanta los targets en paralelo y espera que TODOS
 * respondan en `readyUrl`, así que el target del export nunca se vuelve
 * alcanzable en 8085 (APP_UNREACHABLE, comprobado en landing y admin). Y aunque
 * se eligiera uno con `--target`, el otro proceso no existiría: sin el export no
 * hay `dist/`, y sin el server no hay PWA que abrir.
 *
 * El contraste con `apps/mobile/playwright.config.ts` es instructivo: esa suite
 * encadena export y server en UNA línea de `webServer.command` con `&&`, porque
 * Playwright espera un readiness URL y no un fin de proceso. `e2e` separa las
 * dos cosas: readiness = URL, y el fin del build = exit code propio.
 *
 * ─── Por qué el export va AQUÍ, y no en el `command` del config ─────────────
 *
 * `sh -c "export && server"` funciona en Linux y macOS, y este repo se
 * desarrolla también en Windows, donde no hay `sh`. Además un `&&` en una cadena
 * escondería el código de salida del export detrás del del server. Acá el export
 * es un paso con su propio exit code y `shutdown()` propaga el del hijo que
 * murió: un export rojo, un puerto tomado o un server que colapsa salen todos con
 * SU código, nunca con un 0 que el runner lea como "target sano que no despertó".
 *
 * ─── Reglas que este script no puede romper ────────────────────────────────
 *
 * - Las dummies `EXPO_PUBLIC_*` van SOLO en el env del export. Metro las INLINEA
 *   en el bundle, así que el destino queda fijado en los bytes que se sirven, y
 *   no en el env de quien corre el server: servirlas con el `.env` del shell
 *   apuntaría la suite a un Supabase de verdad.
 * - El server estático NUNCA proxea: un path desconocido es el `index.html` del
 *   fallback SPA (eso lo define `e2e/static-server.mjs`, que es el contrato que
 *   replica el rewrite de `vercel.json`), nunca un forward a otro host.
 */
import path from "node:path";

const STATIC_PORT = "8085";

/**
 * El project root (donde vive `e2e/static-server.mjs` y `scripts/`) es el padre
 * de este archivo. No se usa `process.cwd()`: este script puede invocarse desde
 * cualquier cwd y las rutas relativas de los hijos tienen que ser stably las
 * mismas.
 */
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");

/**
 * Las dummies de `EXPO_PUBLIC_*`, y POR QUÉ son obligatorias.
 *
 * `src/core/config/env.ts` valida TODA la superficie `EXPO_PUBLIC_*` con Zod al
 * arrancar y tira en la primera clave faltante. Sin `SUPABASE_URL` y
 * `SUPABASE_ANON_KEY` la app no monta nunca, cada locator expira, y el fallo se
 * lee como "el test está roto" cuando lo que falta es una variable de entorno.
 * Mismo argumento que `apps/mobile/playwright.config.ts:76-91`, aunque ese
 * archivo omite las cuatro de Firebase que el pre-export exige — un defecto
 * pre-existente de esa suite, documentado en el reporte de esta tarea y
 * deliberadamente NO tocado acá.
 *
 * Las cuatro de Firebase no las valida el schema: las exige el paso de
 * pre-export. `bun run export:web` dispara `preexport:web`
 * (`generate-firebase-config.mjs && generate-css-vars.mjs`), y el primero hace
 * `process.exit(1)` si falta cualquiera de las cuatro porque escribe
 * `public/firebase-config.js`, que el cliente de web-push lee al cargar. MEDIDO en
 * esta máquina sin las cuatro: `preexport:web exit=1` y el mensaje
 * `[generate-firebase-config] EXPO_PUBLIC_FIREBASE_API_KEY no está definida`.
 * Es el mismo motivo, y la misma lista, que `.github/workflows/ci.yml:120-123`.
 *
 * Y tienen que ser INALCANZABLES. Este target no intercepta la red: la PWA pide
 * sus datos a Supabase directo (ADR-0002) y `test.supabase.co` no existe, así que
 * cada consulta falla y la app pinta su estado de error — que es lo honesto para
 * una suite sin backend. Un valor real acá no sería una variable de test: sería
 * la suite leyendo y escribiendo el proyecto de otra persona.
 *
 * ─── POR QUÉ ESTO SÍ SELLA EL DESTINO, Y NO ES SOLO ESTE ARCHIVO ─────────────
 *
 * Que las dummies se pasen por acá es necesario pero NO suficiente: si el runner
 * le deliverara al target el `process.env` entero del shell del dev, un
 * `EXPO_PUBLIC_SUPABASE_URL` real de `apps/mobile/.env` ganaría por precedencia
 * y la suite apuntaría a producción. Lo que lo impide es el runner, y conviene
 * saberlo porque es la mitad de la garantía:
 *
 *   | capa                                        | qué aporta                    |
 *   |---------------------------------------------|-------------------------------|
 *   | este archivo (`EXPO_DUMMIES` al export)     | el valor correcto, explícito  |
 *   | `managed-process.js:9,155-159`              | el allowlist: solo `PATH`,    |
 *   |                                             | `HOME`, `TMPDIR`, `TMP`,      |
 *   |                                             | `TEMP`, `SystemRoot`,         |
 *   |                                             | `COMSPEC` + `command.env`     |
 *
 * O sea que la hermeticidad es una propiedad del RUNNER, y esto la usa. El mismo
 * argumento está escrito para el mismo peligro en
 * `apps/landing/e2e-agent/business-signup.e2e.ts:93-101`, y por eso está acá y
 * no solo en el test: el que decide qué se pasa es este archivo.
 */
const EXPO_DUMMIES: Record<string, string> = {
	EXPO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
	EXPO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
	EXPO_PUBLIC_FIREBASE_API_KEY: "test-firebase-key",
	EXPO_PUBLIC_FIREBASE_PROJECT_ID: "role-test",
	EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
	EXPO_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000000000",
	// El bundle se reconstruye en cada corrida; sin esto Expo-cli puede pedir
	// telemetría entre medio y ralentizar el export.
	EXPO_NO_TELEMETRY: "1",
};

const children: Bun.Subprocess[] = [];

function spawn(name: string, cmd: string[], env: Record<string, string>) {
	const child = Bun.spawn(cmd, {
		cwd: PROJECT_ROOT,
		env: { ...process.env, ...env },
		stdout: "inherit",
		stderr: "inherit",
		// Cada hijo en su PROPIO grupo de procesos. Sin esto, matar al hijo
		// directo no alcanza a sus nietos: `bun` es un shim que a su vez lanza
		// `expo`, y ese proceso es el que escribe en `dist/`.
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
		// MEDIDO en el par de admin (`apps/admin/e2e-agent/serve.ts`), con su
		// stub equivalente ocupado por un proceso ajeno: el hijo moría con
		// `code=1` y `EADDRINUSE`, pero como este handler llamaba a
		// `shutdown()` —que hace `process.exit(0)`— el runner recibía 0 y
		// reportaba `target "…" command exited with code 0 before becoming
		// ready`, que manda a leer el readiness de un target sano con la causa
		// real solo en el log. Y el puerto del server estático NO tiene la
		// pre-verificación que sí tenía el de la UI en los otros dos targets: el
		// runner solo sondea `readyUrl` (managed-process.js:141-147), así que una
		// colisión en 8085 es precisamente el caso que este código tiene que
		// reportar bien.
		shutdown(code ?? 1);
	});
	return child;
}

/**
 * Mata el ÁRBOL de un hijo, no solo el proceso que lo lanzó.
 *
 * POR QUÉ hace falta: `child.kill()` le manda una señal a UN pid. El pid de
 * `bun run export:web` no es el que escribe en `dist/` — lo tiene el `expo` que
 * `bun` lanzó. Si ese nieto sobrevive, sigue escribiendo el bundle mientras la
 * corrida siguiente ya está compilando encima, y el server de esta corrida puede
 * servir un `dist/` a medio escribir. Para el server estático el síntoma es
 * peor: el puerto 8085 queda tomado y la corrida siguiente muere con
 * `APP_ALREADY_RUNNING`, que es un fallo que ni siquiera parece de esta suite.
 *
 * `detached: true` (arriba) es la mitad POSIX de la solución: el hijo es líder de
 * su grupo, así que `kill(-pid)` alcanza a todo el grupo — el shim Y el nieto.
 *
 * En win32 NO existe la señal de grupo, y `process.kill(-pid)` no tiene
 * equivalente: los pids negativos no significan nada allí. La herramienta propia
 * de Windows para esto es `taskkill /T`, donde `/T` es justamente "terminate this
 * process AND the processes it started" — el equivalente nativo de `kill(-pid)`.
 * `/F` fuerza el cierre, sin el cual un proceso que ignora el primer pedido deja
 * el puerto ocupado. Este repo se desarrolla en Windows, así que la rama de win32
 * no es decorativa: es la plataforma donde la suite se usa a diario.
 *
 * Esta rama se EJERCTA en win32 por dos entradas que sí corren sin depender de
 * que un handler de JS alcance a despacharse: un hijo que se muere solo
 * (`child.exited`) y un export rojo. Lo que NO se afirma es que sea alcanzable
 * desde la parada ordenada del runner en win32 — ahí `TerminateProcess` mata el
 * proceso antes de que corra cualquier handler. El detalle está en el bloque de
 * `process.on("SIGINT"/"SIGTERM")` de más abajo; lo importante acá es no
 * presentar la rama como verificada en Windows, porque no lo está: esta caja es
 * Linux y no hay forma de ejecutarla.
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
			// es su propio pid, así que el signo menos lo alcanza sin tocar al
			// runner.
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
 * `code` es un parámetro y no una constante porque las tres rutas de salida
 * necesitan decir cosas distintas, y aplanarlas todas a 0 es lo que hace que un
 * fallo se reporte como un target sano:
 *
 *   | ruta                        | code                       |
 *   |-----------------------------|----------------------------|
 *   | SIGINT / SIGTERM del runner | 0 — parada ordenada        |
 *   | hijo de larga vida muerto   | el del hijo (`code ?? 1`)  |
 *   | `export:web` rojo           | el del export              |
 *
 * `code ?? 1` y no `code ?? 0`: un hijo muerto por señal resuelve `code=null`, y
 * `null` no es un motivo para reportar una salida exitosa.
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
// y los nietos (`bun` → `expo`) mueren. Verificado en esta máquina.
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
// que dispara `taskkill /T /F`. O sea: la rama de win32 de `killTree` es
// alcanzable, pero por las OTRAS dos entradas — un hijo que se muere solo, o un
// export rojo — y no por la parada ordenada del runner.
//
// Lo que NO se claims: que la rama de win32 esté verificada. No lo está, y no se
// puede verificar desde esta caja (Linux). Verificarlo requiere una corrida real
// en Windows mirando el árbol de procesos antes y después. Mismo alcance, mismo
// límite y mismo texto que en `apps/admin/e2e-agent/serve.ts` y
// `apps/landing/e2e-agent/serve.ts`: los tres archivos son un trío espejado y no
// tiene sentido que uno afirme más que los otros.
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Última línea de defensa: si el runner mata el proceso sin que corra el
// handler (SIGKILL, o una muerte abrupta del grupo), `exit` todavía se dispara en
// el Bun padre. Con `detached: true` los hijos ya están en otros grupos, así que
// sobreviven a que nosotros muramos — por eso hay que cazarlos también desde acá.
process.on("exit", () => {
	for (const child of children) killTree(child);
});

/**
 * El export, como paso explícito y NO como hijo de larga vida.
 *
 * No usa `spawn()` a propósito: `spawn` ata un `shutdown()` al `exited` del
 * hijo, y un export que termina bien — que es lo que pasa SIEMPRE que todo esté
 * bien — tiraría la suite abajo. Acá se espera el código de salida y se decide:
 * éxito sigue, fallo apaga lo otro y propaga el código. Un export rojo tiene que
 * ser un target rojo y ruidoso, no un server sirviendo el `dist/` viejo de la
 * corrida anterior, que haría pasar la suite contra código que nadie probó.
 */
async function exportWeb(): Promise<void> {
	console.error("[e2e target] exportando la PWA (expo export --platform web)…");
	// `detached` TAMBIÉN acá, aunque el export sea un paso síncrono. No por el
	// servidor, sino por `killTree`: la rama POSIX hace `kill(-pid)`, y eso solo
	// es el grupo del hijo si el hijo lo|leader|. Sin `detached`, `bun run
	// export:web` corre en el grupo de serve.ts, así que `kill(-pid)` no toca su
	// subárbol — y `bun` es un shim que a su vez lanza `expo`: el que escribe en
	// `dist/` es el nieto.
	//
	// Y el `children.push` de un proceso YA terminado sería peor que inútil:
	// cuando el runner corta la corrida en la fase de test, el handler de `exit`
	// recorre `children` y le manda `kill(-pid)` a un pid que puede haber sido
	// reciclado por otro proceso del sistema. Un SIGTERM a un grupo ajeno, con el
	// export verde y la suite en verde. Por eso `exportWeb` mantiene su propia
	// lista y solo se registra mientras el export corre.
	const exportChildren: Bun.Subprocess[] = [];
	const proc = Bun.spawn(["bun", "run", "export:web"], {
		cwd: PROJECT_ROOT,
		env: { ...process.env, ...EXPO_DUMMIES },
		stdout: "inherit",
		stderr: "inherit",
		detached: true,
	});
	exportChildren.push(proc);
	// El runner puede cortar la corrida DURANTE el export (el presupuesto de
	// `startupTimeout` corre desde el spawn). Sin esto, `bun run export:web` y su
	// nieto quedan huérfanos compilando un bundle que nadie va a servir.
	//
	// Un flag en vez de `process.once`/`process.off`: `off` no está bien tipado en
	// `bun-types` (el overload resuelve a otro evento y `tsc --noEmit` lo
	// rechaza), y desregistrar a mano además es la clase de detalle que se
	// olvida. Con el flag, el handler queda registrado para siempre y simplemente
	// no hace nada cuando el export ya terminó.
	let exportRunning = true;
	process.on("exit", () => {
		if (!exportRunning) return;
		for (const child of exportChildren) killTree(child);
	});

	const code = await proc.exited;
	// El export ya terminó: su pid no nos pertenece más y `shutdown()` —ni este
	// handler— no debe señalarlo.
	exportRunning = false;
	exportChildren.length = 0;

	if (code !== 0) {
		console.error(
			`[e2e target] export:web falló (code=${code}); no se arranca el server estático`,
		);
		// `shutdown(code)`, NO `shutdown()`: el export rojo tiene que salir con el
		// código del export. Un bundle roto tiene que ser un target rojo y ruidoso.
		//
		// Sin `?? 1` a propósito, y a diferencia de los otros dos `serve.ts`: acá
		// la rama está guardada por `code !== 0` (arriba), así que `code` es un
		// número distinto de cero y el fallback sería código muerto. Un hijo
		// muerto por señal resuelve `null`, y esa es la única forma de `null`
		// que el resto del archivo maneja — en `spawn()`, no acá.
		shutdown(code);
	}
	console.error("[e2e target] export ok; arrancando el server estático");
}

/**
 * Falla rápido, ANTES del export, si el puerto que esta suite necesita ya está
 * ocupado.
 *
 * POR QUÉ hace falta, y por qué no alcanza con `reuseExisting: false`. Ese flag
 * gobierna lo que el RUNNER hace con un target ya arrancado: no reusa uno vivo.
 * No es una pre-verificación de que el puerto esté libre, y el runner solo sondea
 * `readyUrl` una vez que arranca el comando (managed-process.js:141-147). O sea
 * que sin esta función, un 8085 tomado significa: se exportan 4-5 minutos de
 * bundle al vacío para recién descubrir que el server no puede escuchar.
 *
 * El costo de hacerlo bien es el de una conexión TCP. En mobile la asimetría es
 * brutal comparada con landing y admin: el paso caro es `expo export` (una
 * lectura completa del grafo de módulos y un bundle de 8.1 MB), y un chequeo lo
 * evita entero. En los otros dos el paso caro es `vite build`, así que el mismo
 * chequeo vale menos — pero el patrón se aplica igual por simetría del trío.
 *
 * Además esta máquina tiene una segunda worktree (`/mnt/c/Users/leonardo/
 * role-bugreports`, branch `feat/bug-reports-b`) cuya suite de Playwright levanta
 * SU static server en el mismo 8085 (`MOBILE_E2E_PORT` tiene el mismo default).
 * Las dos suites son indistinguibles desde afuera, así que el
 * mensaje dice explícitamente que puede ser la otra y que no hay que matar nada
 * ajeno.
 *
 * Por qué NO se re-lanza el server ajeno ni se lo mata: no es de esta corrida, y
 * un `kill` a ciegas de otro árbol de procesos es la clase de bug que borra el
 * trabajo de otra persona.
 */
async function assertPortFree(): Promise<void> {
	const port = Number(STATIC_PORT);
	// `Bun.connect` tira en el connect si nadie escucha, así que el try/catch ES
	// la sonda: no hay que abrir un socket a mano y cerrarlo. El tipo es el de Bun
	// y no el de `node:net` a propósito: ambos se llaman `Socket` y no son
	// intercambiables (el de Bun no tiene `destroySoon`/`setEncoding`/etc.), así
	// que importar el equivocado rompe el typecheck en vez de dejarlo pasar.
	let socket: Awaited<ReturnType<typeof Bun.connect>> | null = null;
	try {
		socket = await Bun.connect({
			hostname: "127.0.0.1",
			port,
			// Se cierra en cuanto abre: la prueba es que el TCP handshake
			// completó, no leer nada. Sin esto el peer ve una conexión abierta
			// que no termina.
			socket: {
				data() {},
				open(s) {
					s.end();
				},
			},
		});
	} catch {
		// ECONNREFUSED (o EADDRNOTAVAIL): nadie escucha. Es el caso bueno.
		console.error(
			`[e2e target] puerto ${port} libre; arrancando el export de la PWA`,
		);
		return;
	}
	socket.end();
	console.error(
		[
			`[e2e target] el puerto ${port} YA ESTÁ OCUPADO.`,
			"",
			"AbORTANDO antes de exportar: el export de la PWA tarda 4-5 minutos y",
			"después el server estático no podría escuchar igual, así que esperar",
			"sería gastar la corrida entera para fallar en el mismo lugar.",
			"",
			"Causas probables:",
			"  - la suite de Playwright de esta misma app (comparten el puerto 8085),",
			"  - la worktree /mnt/c/Users/leonardo/role-bugreports, que también",
			"    levanta un server en 8085,",
			"  - un `e2e/static-server.mjs` de una corrida anterior.",
			"",
			`Liberalo y volvé a correr. Para ver quién lo tiene: lsof -i :${port}`,
			"",
			"No se mata al proceso ajeno: no es de esta corrida.",
		].join("\n"),
	);
	// Código propio y DISTINTO del de un export rojo, para que el log del runner
	// diga de una que el problema fue el puerto y no el bundle.
	shutdown(2);
}

// El pre-flight va PRIMERO y por una razón que no es estética: si el puerto
// está tomado, el export no tiene a quién servirle. Correrlo después del export
// sería un chequeo que llega tarde por construcción.
await assertPortFree();
await exportWeb();

// El server sirve el `dist/` que el export acaba de escribir con las dummies
// `EXPO_PUBLIC_*` ya INLINEADAS en los bytes. No se le pasa env: no lee ninguna
// (las variables se sustituyen en el bundle, no en el proceso que lo sirve), y
// pasarlas sería sugerir una dependencia que no existe. Lo que las hace
// airtight es el ENV DEL EXPORT: ver el comentario de `EXPO_DUMMIES`.
spawn(
	"static-server",
	["bun", "e2e/static-server.mjs", STATIC_PORT, "dist"],
	{},
);
