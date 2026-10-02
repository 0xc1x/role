import { test } from "@e2e-dev/web";
import { expect } from "e2e";

/**
 * The gate de auth del panel, con la aserción de destino que la vuelve segura.
 *
 * ─── Por qué este archivo no es "el redirect y ya" ─────────────────────────
 *
 * El brief pedía un test que abre `/negocios` anónimo y comprueba que la URL
 * terminó en `/login`. Ese test pasa contra un panel que habla con el backend
 * de PRODUCCIÓN: el destino de la API no aparece en ninguno de sus pasos, así
 * que un `VITE_API_URL` filtrado desde `.env` no lo vuelve rojo — lo vuelve
 * más rápido, porque el redirect se decide en el cliente y no depende de la
 * API. El repo ya escribió esta regla en
 * `apps/landing/e2e/business-signup.spec.ts:176-178` ("The safety assertion:
 * the write went to loopback") y en `e2e/support/admin.ts:23-42` (la mitad
 * server de la API existe justamente porque el navegador no la ve toda).
 *
 * ─── POR QUÉ `preview` Y NO `vite dev`, y por qué esto no es una preferencia ──
 *
 * MEDIDO en esta máquina, mismo flujo, misma caja (ver task-2-report.md):
 *
 *   | servidor  | entradas en Resource Timing | entradas `/api/v1` visibles |
 *   |-----------|------------------------------|-----------------------------|
 *   | vite dev  | 250 (LLENO, el tope del buffer) | 0 — EVICTADAS            |
 *   | vite preview | 77                                        | 5 — las 5 de 4110      |
 *
 * En `vite dev` el panel carga el grafo de módulos del dev server: cientos de
 * peticiones, una por módulo. El buffer de Resource Timing tiene un tope fijo
 * (250 por defecto en Chromium) y NO es circular: cuando se llena, las entradas
 * nuevas se descartan. Las peticiones a `/api/v1` son exactamente las ÚLTIMAS
 * de la página, así que son las primeras que se pierden. O sea: la aserción de
 * destino que la tarea marca como obligatoria NO SE PUEDE ESCRIBIR contra
 * `vite dev` — no sale verde por estar bien, sale verde por no ver nada.
 *
 * Esto refuerza el argumento que `playwright.config.ts:92-97` ya daba para
 * elegir `preview` (probamos el artefacto que se despacha, no un bundle
 * distinto), y agrega uno propio del runner `e2e`: el tope del buffer convierte
 * la diferencia entre las dos suites en una diferencia entre una prueba y otra.
 */
/**
 * El origen del stub de loopback: la ÚNICA API a la que este test puede
 * escribir. Va en una constante (y no repetido como literal) para que el
 * mensaje de un fallo pueda nombrarla, igual que en
 * `apps/landing/e2e-agent/business-signup.e2e.ts:22`.
 */
const LOOPBACK = "127.0.0.1:4110";

/**
 * El origen del PREVIEW, el otro punto de loopback permitido. Va en una
 * constante propia y no interpolado en el filtro: el filtro de la aserción (c)
 * tiene que leer "el dev/preview O el stub" y no "cualquier 127.0.0.1", porque
 * un puerto de loopback distinto sería EXACTAMENTE el destino no permitido que
 * la aserción existe para cazar.
 */
const UI_ORIGIN = "127.0.0.1:3110";

/**
 * Mismo par que `apps/admin/e2e/fixtures/api-fixtures.ts:121-122`, que es el
 * único que `e2e/stub-api.ts:144` acepta. En esta fase son constantes del
 * test y no `credentials` de la config: no hay secret manager detrás, y
 * `credentials` sin uno solo mueve el problema. La forma en que Phase 2 las
 * resuelve es el mismo bloque, con el valor saliendo de `secrets.get()`.
 */
const ADMIN_EMAIL = "admin@role.test";
const ADMIN_PASSWORD = "correct-horse-battery";

test("un anónimo que pide una sección aterriza en el login, y el login habla con el stub de loopback", async ({
	app,
	screen,
	browser,
}) => {
	await app.open("/negocios");

	// ── HYDRATION GATE ────────────────────────────────────────────────────────
	//
	// `useRequireSession()` (`features/auth/utils/guards.ts:44`) corre en un
	// `useEffect`, o sea DESPUÉS de la hidratación, y solo el cliente puede
	// decidir: durante SSR `localStorage` no existe, así que el servidor no
	// puede ver el token. Por eso `/negocios` para un anónimo NO rebota en el
	// servidor — `curl` lo confirma: 307 a `/negocios?page=1&limit=10` (el
	// normalizador de search params) y después 200 con el shell del layout.
	//
	// La señal que se espera es la MISMA que usa la suite hermana de Playwright
	// en `e2e/support/admin.ts:195` (`waitForGuardDecision`), y por el mismo
	// motivo: preguntar si React ya tomó posesión del nodo exacto del que la
	// decisión trata. La hidratación engancha un expando `__reactProps$*` a cada
	// nodo que hidrata; un nodo sin él no tiene handler, sin importar qué
	// digan sus atributos.
	//
	// Por qué no `toHaveURL(/\/login/)` como gate: la URL sigue en vuelo
	// mientras el guard decide. Es una aserción sobre un instante, no sobre un
	// estado terminal. Y por qué no el gate del landing (una query a
	// `/api/v1/app-config`): acá el cliente es demostrablemente MUDO — con
	// `enabled: !!getToken()` y sin token la query ni corre — y un waiter sobre
	// una request que nunca ocurre se ve como una suite lenta, no como una
	// rota.
	//
	// No es un timer: el expando aparece o no aparece, y si la app se rompe el
	// gate agota el presupuesto y dice por qué.
	await expect
		.poll(
			() =>
				browser.evaluate(() => {
					const el = document.querySelector('input[name="email"]');
					return (
						el !== null &&
						Object.keys(el).some((key) => key.startsWith("__reactProps$"))
					);
				}),
			{
				timeout: 60_000,
				message:
					"el guard no decidió: tras abrir /negocios, el input de email nunca apareció hidratado (ni en /negocios ni en /login)",
			},
		)
		.toBe(true);

	await expect(browser).toHaveURL(/\/login/);

	// ── EL LOCATOR, verificado y no adivinado ─────────────────────────────────
	//
	// `login.form.tsx:128` renderiza `<FieldLabel htmlFor={field.name}>Email</FieldLabel>`
	// sobre `<Input id={field.name} type="email">` (línea 129), así que el
	// nombre accesible del campo es exactamente `Email`, y `input[type=email]`
	// tiene rol `textbox`. El regex `/correo|email/i` del brief era una
	// suposición; este nombre sale del HTML servido.
	//
	// Y el nombre NO es decorativo en esta página: `getByRole("textbox")` a
	// secas matchea también los `<input type="date">` de Ingresos del dashboard
	// (medido: `revenue-from` y `revenue-to`). Sin el nombre, el locator es
	// ambiguo y falla por la razón equivocada.
	await expect(screen.getByRole("textbox", { name: "Email" })).toBeVisible();
	await expect(
		screen.getByRole("button", { name: "Iniciar Sesión" }),
	).toBeVisible();

	// ─── THE SAFETY ASSERTION: la API que contestó es el loopback ────────────
	//
	// Hasta acá, todo lo que este test probó es el gate, y el gate se decide en
	// el cliente: SEGUIRÍA PASANDO si `VITE_API_URL` apuntara a
	// `localhost:4001` (el default de `src/config/api-url.ts`, la API real de
	// la máquina del dev) o al backend de producción. Así que ahora se entra al
	// panel con la única cuenta que `e2e/stub-api.ts` acepta, y se mira a
	// DÓNDE fue el tráfico del cliente.
	//
	// El login en sí es una `createServerFn` (`features/auth/server.ts:72`):
	// el navegador POSTea a `/_serverFn/...` en su propio origen y es el
	// proceso de Vite/Nitro el que llama a la API — medido en el log de
	// requests. Por eso la aserción NO busca el POST de login: esa request no
	// existe en el Resource Timing del navegador, y buscarla sería buscar algo
	// que el diseño garantiza que no está. Lo que SÍ ve el navegador son las
	// queries del panel (`lib/api/client.ts` habla `env.VITE_API_URL` directo),
	// y esas son las que nombran el destino.
	await screen.getByRole("textbox", { name: "Email" }).fill(ADMIN_EMAIL);
	await screen.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
	await screen.getByRole("button", { name: "Iniciar Sesión" }).click();

	await expect(browser).toHaveURL(/\/home/, { timeout: 60_000 });

	// El login solo "funciona" si algo devolvió una sesión admin. La cuenta
	// `admin@role.test` no existe en ningún backend real, así que verla en el
	// panel es la contraparte de las dos aserciones de abajo: el stub no solo
	// recibió el tráfico, lo entendió y lo sirvió.
	await expect(screen.getByText(ADMIN_EMAIL)).toBeVisible();

	const resourceUrls = () =>
		browser.evaluate(() =>
			performance
				.getEntriesByType("resource")
				.map((entry) => entry.name as string),
		);

	const apiUrls = async () =>
		(await resourceUrls()).filter((url) => url.includes("/api/v1/"));

	// (a) NO VACUA. Sin esto, "ninguna request fuera de loopback" pasaría en
	// verde con CERO requests — un verde que no probó nada. Esta línea es la que
	// hace que la de abajo diga algo. Y el `message` nombra el síntoma real si
	// falla: el tope del buffer de Resource Timing, no una app sana.
	await expect
		.poll(apiUrls, {
			timeout: 60_000,
			message:
				"el panel nunca dejó registrada una request a /api/v1: o no se entró, o el buffer de Resource Timing se llenó con el grafo de módulos del dev server y las evictó (por eso la suite usa vite preview)",
		})
		.not.toEqual([]);

	// (b) Y que TODAS sean loopback. El fallo lista la URL culpable, que es
	// justo lo que hay que leer para entender qué se rompió.
	//
	// NO VACUA, y medido: se corrió la suite entera con el MISMO stub movido al
	// puerto 4111 — todo idéntico menos el destino — y el panel entró, se
	// logueó y mostró el panel entero (verde hasta acá) para caer JUSTO en esta
	// línea, con las cinco URLs en 4111 listadas en el mensaje. Sin esta
	// aserción esa corrida habría pasado.
	await expect
		.poll(
			async () => (await apiUrls()).filter((url) => !url.includes(LOOPBACK)),
			{
				timeout: 10_000,
				message:
					"el panel consultó una API que NO es el stub de loopback (la lista del fallo la muestra): este test está leyendo/escribiendo el backend real",
			},
		)
		.toEqual([]);

	// (c) Y que NADA de la página salió de loopback, no solo lo que lleva
	// `/api/v1`. Es la versión sin filtro de la anterior: una futura ruta que
	// hable con un host nuevo por otra vía (un `fetch` a un host distinto, una
	// fuente, un beacon) queda adentro del mismo candado en vez de pasar por
	// debajo.
	await expect
		.poll(
			async () =>
				(await resourceUrls()).filter(
					(url) => !url.includes(UI_ORIGIN) && !url.includes(LOOPBACK),
				),
			{
				timeout: 10_000,
				message:
					"la página abrió un recurso fuera del dev server y del stub de loopback (la lista del fallo la muestra)",
			},
		)
		.toEqual([]);
});
