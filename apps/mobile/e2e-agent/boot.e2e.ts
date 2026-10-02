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
 * 1. **No hay ningún `role="heading"` en la PWA.** `SectionHeader` renderiza el
 *    título con `AppText variant="h3"`, y `AppText` (`src/core/ui/AppText.tsx`)
 *    no pasa `accessibilityRole`: en react-native-web eso es un `<div dir="auto">`
 *    sin rol. MEDIDO: `document.querySelectorAll('[role="heading"]')` devuelve
 *    `[]` tanto en el pager de primera visita como en el feed. Un
 *    `getByRole("heading", …)` no falla "por poco": no tiene nada que encontrar.
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
 * motivo que no esohlvidado: el móvil consume Supabase directo (ADR-0002), así que
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
	const resourceUrls = () =>
		browser.evaluate(() =>
			performance.getEntriesByType("resource").map((entry) => entry.name),
		);

	const offLoopback = async () =>
		(await resourceUrls()).filter(
			(url) => !url.includes(STATIC_ORIGIN) && !url.includes(DUMMY_ORIGIN),
		);

	// (a) NO VACUA por omisión: el buffer tiene que tener entradas, y tiene que
	// tener entradas del server estático. Sin esta línea, "nada fuera de
	// loopback" pasaría en verde con CERO requests —un verde que no probó nada—
	// y también pasaría en verde con un buffer lleno de nada.
	await expect
		.poll(
			async () =>
				(await resourceUrls()).filter((url) => url.includes(STATIC_ORIGIN))
					.length,
			{
				timeout: 60_000,
				message:
					"la página no cargó NADA del server estático de loopback: o el bundle no se sirvió, o el buffer de Resource Timing está vacío y la aserción de destino de abajo no probaría nada",
			},
		)
		.toBeGreaterThan(0);

	// (b) Y que TODAS sean del server estático o de la dummy. El fallo lista la
	// URL culpable, que es justo lo que hay que leer para entender qué se rompió.
	//
	// NO VACUA, y medido por mutación en las DOS direcciones, porque una sola no
	// alcanza para separar "esta línea lee URLs de verdad" de "esta línea lee una
	// lista que siempre está vacía":
	//
	//   | mutación                                  | dónde cae           |
	//   |--------------------------------------------|---------------------|
	//   | `serve.ts` con el server en 8086           | (a), `expected 0`   |
	//   | `serve.ts` con SUPABASE_URL filtrada a un  | (b), las 21 URLs    |
	//   | host ajeno                                | listadas            |
	//
	// La primera mueve el ORIGEN PERMITIDO, así que (a) —que exige al menos una
	// entrada del server declarado— se apaga antes de llegar acá: sirve para
	// probar que (a) muerde. La segunda deja el server estático donde estaba y
	// mueve el DESTINO del backend, que es el accidente que esta suite existe
	// para cazar: la app arrancó, saltó el pager y mostró el feed (verde hasta
	// acá) para caer JUSTO en esta línea con las 21 peticiones a
	// `leaked-prod-backend.invalid` listadas en el mensaje. Sin (b), esa
	// corrida habría pasado en verde.
	await expect
		.poll(offLoopback, {
			timeout: 10_000,
			message:
				"la PWA abrió un recurso fuera del server estático y de la dummy de Supabase (la lista del fallo la muestra): este test está leyendo/escribiendo un backend real",
		})
		.toEqual([]);

	// (c) Y que la entrada de la dummy en el allowlist de (b) NO sea código
	// muerto. Si la app nunca hubiera intentado hablar con Supabase, (b) habría
	// pasado sin necesitar el permiso, y la línea de arriba estaría admitiendo un
	// destino que nadie usó. Esta aserción dice que el permiso se usó, que es lo
	// que vuelve verdadera la forma de (b).
	await expect
		.poll(
			async () =>
				(await resourceUrls()).filter((url) => url.includes(DUMMY_ORIGIN))
					.length,
			{
				timeout: 30_000,
				message:
					"la app nunca intentó consultar Supabase: el permiso de la dummy en la aserción (b) no se está usando, o el bundle dejó de arrancar sus queries",
			},
		)
		.toBeGreaterThan(0);
});
