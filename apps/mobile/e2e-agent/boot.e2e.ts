import { test } from "@e2e-dev/web";
import { expect } from "e2e";

import { strings } from "../src/core/i18n/strings";

/**
 * ─── Por qué este archivo tiene tres pasos y no uno ──────────────────────────
 *
 * El brief pedía `app.open("/")` y un heading de ofertas. MEDIDO en esta máquina
 * sobre el artefacto exportado (ver task-3-report.md), ese test no puede existir
 * tal como está escrito, por dos razones que son del PRODUCTO y no del runner:
 *
 * 1. **Ninguna pantalla alcanzable de la PWA expone un `role="heading"`.**
 *    MEDIDO con `document.querySelectorAll('[role="heading"]')` sobre el
 *    artefacto exportado: `[]` en el pager de primera visita y `[]` en el feed
 *    (y también `[]` para `h1`-`h6`). La causa en las pantallas que importan:
 *    `SectionHeader` renderiza el título con `AppText variant="h3"`, y
 *    `AppText` (`src/core/ui/AppText.tsx`) no pasa `accessibilityRole` — en
 *    react-native-web eso es un `<div dir="auto">` sin rol. Un
 *    `getByRole("heading", …)` no falla "por poco": no tiene nada que encontrar.
 *
 *    El alcance de la afirmación es DELIMITADO a propósito, porque el kit SÍ
 *    sabe emitir el rol: `components/ui/text.tsx:57-61` mapea las variantes
 *    `h1`-`h4` a `role="heading"` y `components/ui/card.tsx:54` hace lo mismo en
 *    `CardTitle`. Lo que pasa es que nadie los usa hoy — verificado: cero
 *    `<Text variant="h[1-4]">` y cero `<CardTitle>` fuera de un mock de test— y
 *    las pantallas titulan con `AppText`. O sea que la regla es "acá no hay rol,
 *    y se sabe por qué", no "este kit no puede dar roles". El día que alguien use
 *    el `Text` de shadcn, un locator por `getByRole("heading")` vuelve a ser
 *    válido y este comentario queda desactualizado a propósito de ser viejo.
 *
 * 2. **`/` no muestra el feed a un invitado nuevo.** `app/index.tsx` es el único
 *    dueño de "a dónde va este viewer", y con el flag de onboarding sin marcar
 *    manda a `/onboarding`. MEDIDO: `app.open("/")` aterriza en
 *    `http://127.0.0.1:8085/onboarding`, no en el feed.
 *
 * Por eso el recorrido es el de una persona: abre la PWA, salta el pager con el
 * botón que la propia app pone para eso (`strings.onboarding.skip`, que marca el
 * flag en AsyncStorage y navega a `/(consumer)`), y recién ahí mira el feed. Es
 * un camino de producto, no un atajo de test: no siembra `localStorage` a mano ni
 * depende de un `addInitScript` que esta suite no tiene.
 */

/**
 * El origen del server estático de la suite: el ÚNICO lugar del que esta PWA
 * puede cargar bytes. Va en una constante y no repetido como literal porque las
 * aserciones de abajo comparan contra un string: si el server se moviera de
 * puerto y la constante quedara atrás, el fallo tiene que poder NOMBRAR las URLs
 * culpables, que es justo lo que hay que leer para entender qué se movió.
 */
const STATIC_ORIGIN = "127.0.0.1:8085";

/**
 * El origen de la dummy de Supabase. Es un segundo destino PERMITIDO, y por un
 * motivo que no es olvidado: el móvil consume Supabase directo (ADR-0002), así que
 * en una corrida sin backend la PWA intenta hablar con él y falla. Y esa
 *dummy tiene que ser inaccesible de verdad — MEDIDO: `getent hosts
 * test.supabase.co` no resuelve y `curl` sale con código 000— porque una
 * dummy alcanzable no es una variable de test: sería la suite leyendo datos de
 * otra persona.
 *
 * El allowlist nombra el ORIGEN, no "cualquier loopback": un puerto distinto
 * sería exactamente el destino no permitido que la aserción existe para cazar.
 */
const DUMMY_ORIGIN = "test.supabase.co";

test("la PWA arranca y el invitado de primera visita llega al feed de ofertas", async ({
	app,
	screen,
	browser,
}) => {
	// El ancho de un teléfono, y por el mismo motivo que
	// `playwright.config.ts:51-54`: la PWA es phone-first y su navegación es una
	// barra inferior. Probarla a ancho de escritorio no prueba nada del layout que
	// el usuario recibe.
	await browser.setViewport({ width: 390, height: 844 });

	await app.open("/");

	// ── PASO 1: el gate de arranque está vivo ─────────────────────────────────
	//
	// Este botón no es decorativo: es la ÚNICA forma de que un invitado pase del
	// pager al feed, y su `onPress` marca el flag de onboarding y navega. O sea
	// que encontrarlo prueba de una vez, y en un solo nodo, las tres cosas que
	// `app/01-boot.spec.ts` (la suite hermana de Playwright) enumera por
	// separado: que el validador Zod de `EXPO_PUBLIC_*` pasó, que las fuentes
	// resolvieron, que el prefetch de config se as settleó y que el auth store
	// salió de `loading`. Si cualquiera de las cuatro fallara, la app se queda en
	// la splash de 6 s y este locator expira.
	//
	// `role="button"` es real y verificado: `components/ui/button.tsx:190` pone
	// `role="button"` en el Pressable, y `app/onboarding.tsx` le pasa
	// `accessibilityLabel={strings.onboarding.skip}`.
	await expect(
		screen.getByRole("button", { name: strings.onboarding.skip }),
	).toBeVisible();
	await screen.getByRole("button", { name: strings.onboarding.skip }).click();

	// ── PASO 2: el feed de ofertas ───────────────────────────────────────────
	//
	// `strings.home.ultimasHoras` ("Últimas Horas") es el título de la primera
	// sección de ofertas del home (`app/(consumer)/index.tsx` →
	// `OfferRowSection type="expiring"`). MEDIDO: es el único texto del feed que
	// `getByText` resuelve con exactamente un match —"Ofertas Populares" da dos,
	// medido, y por eso no sirve— así que el locator es inequívoco sin needing
	// `.first()` ni filtros.
	//
	// Sobre lo que hay DEBAJO del título: con la dummy de Supabase inalcanzable
	// la app pinta su estado de error ("Error al cargar ofertas por expirar"),
	// y eso es lo correcto y no un defecto de esta suite: la regla de
	// `OfferRowView` es que un fallo de red NO se pinte como un marketplace
	// vacío. Un header sobre un `ErrorState` prueba que la app distingue el
	// fallo del vacío; un header sobre tarjetas probaría que Supabase respondió,
	// y contra quién respondió no está al alcance de esta suite.
	//
	// Y el título se renderiza igual durante el loading (skeletons en vez de
	// tarjetas), así que el assert no depende del estado de la consulta.
	await expect(browser).toHaveURL(/\/$/, { timeout: 60_000 });
	await expect(screen.getByText(strings.home.ultimasHoras)).toBeVisible();

	// ─── THE SAFETY ASSERTION: la app solo habló con el loopback ─────────────
	//
	// Hasta acá todo lo que este test probó es de la RENDERIZACIÓN, y la
	// renderización no dice a QUIÉN consultó la app. Con la dummy de Supabase
	// inalcanzable cada consulta falla —y una app que falla en todo se vería
	// exactamente igual— así que una suite que se limitara a lo de arriba sería
	// incapaz de distinguir "no hay backend" de "el bundle apuntó al Supabase de
	// producción". Ese es el agujero real: `apps/mobile/.env` es el archivo que
	// el shell del dev suele tener, y una suite que hereda su valor está leyendo
	// el proyecto de otra persona.
	//
	// Lo que se mide es el historial de URLs que la página YA pidió, leído del
	// buffer de Resource Timing. Se elige ese mecanismo y no `waitForRequest`
	// porque el registro PERMANECE después de que la respuesta terminó —la
	// respuesta, en este caso, nunca llega— así que no hay ventana que perder
	// sin importar en qué momento se lee. MEDIDO sobre el artefacto exportado:
	// 34 entradas, 21 de ellas las de `test.supabase.co` que NO resolvieron.
	// Una request que muere por DNS igual deja su entrada, que es justo lo que
	// hace posible cazar el escape: no hay que esperar a que algo tenga éxito.
	//
	// Y lo que protege contra un `EXPO_PUBLIC_SUPABASE_URL` real heredado del
	// shell del dev no es este archivo: es el allowlist de env del runner
	// (`managed-process.js:9,155-159`), que le entrega al target solo
	// `PATH`/`HOME`/`TMPDIR`/`TMP`/`TEMP`/`SystemRoot`/`COMSPEC` más
	// `command.env`. Está razonado en `e2e-agent/serve.ts` porque el que decide
	// qué se pasa es ese archivo; el mismo argumento para el mismo peligro está
	// en `apps/landing/e2e-agent/business-signup.e2e.ts:93-101`.
	const resourceUrls = () =>
		browser.evaluate(() =>
			performance.getEntriesByType("resource").map((entry) => entry.name),
		);

	/**
	 * UN poll, no tres.
	 *
	 * La versión anterior eran tres `expect.poll` secuenciales —(a) "hay entradas
	 * del server estático", (b) "ninguna fuera del allowlist", (c) "la dummy se
	 * usó"— y el review tenía razón en las tres objeciones, porque se derivan
	 * todas de una misma propiedad del matcher: **`poll` resuelve en la PRIMERA
	 * lectura que cumple**, así que cada aserción congelaba el estado en un
	 * instante arbitrario en vez de afirmar un invariante.
	 *
	 * Los tres consecuencias, que son los tres bugs:
	 *
	 * 1. (b) se muestreaba antes de que existiera el tráfico que filtra. (a)
	 *    cumplía con los chunks de JS/CSS, que llegan ~70 ms después de que se
	 *    pinta el feed y NO son el tráfico que (b) filtra. O sea que (b) podía
	 *    pasar en verde con `[]` porque todavía no había nada que filtrar.
	 * 2. (c) corría DESPUÉS de (b), así que una fuga real —que por definición
	 *    vacía el allowlist de la dummy— hacía fallar (c) con "la app nunca
	 *    intentó consultar Supabase". El mensaje describía lo OPUESTO de lo que
	 *    había pasado: la app había intentado hablar con un host que no es la
	 *    dummy. Un mensaje que culpa a la app de algo que no hizo.
	 * 3. El resultado era que "no hay fugas" era una afirmación sobre un
	 *    instante, no sobre la corrida.
	 *
	 * La forma que corrige las tres: que el valor sondeado SEA el diagnóstico.
	 * `poll` resuelve cuando el valor cumple, así que se le pide un valor que
	 * solo pueda cumplir cuando TODO lo que esta suite quiere afirmar es cierto
	 * a la vez, y que además lleve en la carga útil la evidencia del fallo.
	 *
	 * El resultado tiene DOS salidas y no tres, porque "no hay tráfico de
	 * backend todavía" y "no hay tráfico de backend nunca" son el MISMO valor
	 * —se resuelve por espera, no por diagnóstico— y confundirlos sería
	 * justamente el error que se está corrigiendo. Lo que sí se distingue es el
	 * caso degenerado de (a): un buffer sin una sola entrada del server estático
	 * no es "todavía no", es "el bundle no se sirvió", y se reporta aparte
	 * porque es un fallo del ARTIFACTO, no de la aserción de destino.
	 */
	const audit = async () => {
		const urls = await resourceUrls();
		const staticEntries = urls.filter((url) => url.includes(STATIC_ORIGIN));
		const dummyEntries = urls.filter((url) => url.includes(DUMMY_ORIGIN));
		const offAllowlist = urls.filter(
			(url) => !url.includes(STATIC_ORIGIN) && !url.includes(DUMMY_ORIGIN),
		);
		return { staticEntries, dummyEntries, offAllowlist };
	};

	// (a) El buffer tiene que tener contenido del server estático. Va PRIMERO y
	// aparte porque es lo único que distingue "la aserción de destino no vio nada
	// porque todavía no había tráfico" de "la aserción de destino no vio nada
	// porque no hay página". MEDIDO en verde: 34 entradas, 13 del server.
	//
	// Además sube el PISO del resto: recién con esto confirmado tiene sentido que
	// "no hay nada fuera del allowlist" signifique algo.
	await expect
		.poll(async () => (await audit()).staticEntries.length, {
			timeout: 60_000,
			message:
				"la página no cargó NADA del server estático de loopback: o el bundle no se sirvió, o el buffer de Resource Timing está vacío — y entonces la aserción de destino de abajo no probaría nada",
		})
		.toBeGreaterThan(0);

	// (b)+(c) UNA sola aserción para las dos, y es donde estaba el hole.
	//
	// El valor sondeado es un VEREDICTO, no una lista. Eso es lo que hace que el
	// mensaje sea cierto: el objeto lleva la evidencia que el matcher imprime en
	// el fallo, así que el fallo nombra la condición sin que un `message` estático
	// tenga que adivinarla.
	//
	//   | veredicto                                | significado                        |
	//   |-------------------------------------------|------------------------------------|
	//   | `{ verdict: "ok", … }`                   | tráfico de backend Y sin fuga      |
	//   | `{ verdict: "pending", … }`              | todavía no hay tráfico de backend  |
	//   | `{ verdict: "leak", … }`                 | hay tráfico permitido y una fuga   |
	//   | `{ verdict: "leaked-elsewhere", … }`     | TODO el tráfico se fue a otro lado |
	//
	// La tercera fila es exactamente el caso que antes se reportaba como "la app
	// nunca intentó consultar Supabase" — el mensaje que describía lo OPUESTO de
	// lo que había pasado. Ahora la misma lectura dice "se fue a otro lado", con
	// las URLs encima.
	//
	// LA SEGUNDA FILA ES LA QUE CIERRA EL HOLE DEL PUNTO 1, y es la parte de la
	// forma que no es obvia: `"ok"` NO es "no vi nada fuera del allowlist", es
	// "vi tráfico de la dummy Y nada fuera del allowlist". Si el veredicto fuera
	// solo la segunda mitad, la línea seguiría resolviendo en el instante en que
	// el buffer está todavía vacío —que es exactamente el bug— porque un
	// allowlist vacío y un buffer vacío dan el mismo `[]`. Con la mitad del
	// tráfico adentro, un buffer todavía vacío da `"pending"` y la línea ESPERA.
	// Recién cuando el backend habló y no hubo fuga, resuelve.
	//
	// Ese es el cambio de fondo: la condición de resolución pasó a ser "se
	// cumple lo que se quiere afirmar, en el mismo instante", y no "se cumple
	// una mitad y la otra se cumple en algún momento".
	//
	// NO VACUA, y medido por mutación en las DOS direcciones, porque una sola no
	// alcanza para separar "esta línea lee URLs de verdad" de "esta línea lee una
	// lista que siempre está vacía":
	//
	//   | mutación                                  | resultado               |
	//   |--------------------------------------------|-------------------------|
	//   | `serve.ts` con el server en 8086           | cae en (a)              |
	//   | `serve.ts` con SUPABASE_URL a un host ajeno | cae en (b), fila 3      |
	//
	// La primera mueve el ORIGEN PERMITIDO y (a) se apaga antes de llegar acá:
	// prueba que (a) muerde. La segunda deja el server estático donde estaba y
	// mueve el DESTINO del backend, que es el accidente que esta suite existe
	// para cazar: la app arrancó, saltó el pager y mostró el feed (verde hasta
	// acá) para caer JUSTO en esta línea con las 21 peticiones a
	// `leaked-prod-backend.invalid` en la carga útil del fallo.
	await expect
		.poll(
			async () => {
				const { dummyEntries, offAllowlist } = await audit();
				// El orden de las dos preguntas importa y es el que hace la
				// aserción no vacua:
				//
				//   1. ¿Hubo tráfico de la dummy? Si no → "pending". Esta línea NO
				//      resuelve, sigue esperando. Es el cierre del hole: un
				//      buffer todavía vacío no puede pasar por "ok".
				//   2. ¿Algo se fue del allowlist? Si sí → fuga, y el nombre
				//      depende de si también hubo tráfico de la dummy (permiso
				//      usado) o no (todo se fue afuera).
				//   3. Ambas palabras → "ok".
				//
				// O sea que "ok" NO significa "no vi nada raro": significa "vi
				// tráfico Y no vi nada raro", en el mismo instante. Cualquier
				// otro diseño deja una de las dos mitades sin afirmar.
				const verdict =
					offAllowlist.length > 0
						? dummyEntries.length > 0
							? "leak"
							: "leaked-elsewhere"
						: dummyEntries.length > 0
							? "ok"
							: "pending";
				return { verdict, dummy: dummyEntries.length, offAllowlist };
			},
			{
				timeout: 30_000,
				message:
					"la PWA abrió tráfico fuera del server estático y de la dummy de Supabase (las URLs están en `offAllowlist`, abajo): este test está leyendo/escribiendo un backend real. Si `dummy` es 0 y `offAllowlist` no lo está, el tráfico entero se fue a un host ajeno — eso también es una fuga, no una app que no consultó",
			},
		)
		// `toMatchObject` y no `toEqual` por el campo `dummy`: lo que se afirma es
		// el veredicto y que la lista de fugas esté vacía. `dummy` viaja en el
		// valor justamente para NO afirmarlo —es la evidencia de que hubo tráfico,
		// y por eso tiene que estar en la carga útil que el fallo imprime— y
		// `toMatchObject` tolera las propiedades extra del valor. Con `toEqual`
		// habría que fijar el número exacto de peticiones, que no es lo que esta
		// suite quiere afirmar y sería tan frágil como inútil.
		.toMatchObject({ verdict: "ok", offAllowlist: [] });
});
