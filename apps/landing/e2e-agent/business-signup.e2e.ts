import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const VALID = {
	name: "Ada Lovelace",
	email: "ada@e2e.example",
	password: "sup3rsecreta",
	business: "Panadería La Espiga",
	phone: "+593 99 123 4567",
};

/**
 * El origen del stub de loopback, que es la ÚNICA cosa a la que este test
 * puede escribir.
 *
 * Va en una constante y no repetido como literal en las aserciones porque estas
 * comparan contra un string: si el stub se moviera de puerto y la constante
 * quedara atrás, `toContain` fallaría —que es lo correcto— pero el mensaje
 * sería un booleano misterioso en vez de "el POST fue a 4100". Con la constante
 * el mensaje puede nombrarla, y el test sigue leyendo la intención.
 */
const LOOPBACK = "127.0.0.1:3999";

test("un negocio nuevo se registra desde el formulario público", async ({
	app,
	screen,
	browser,
}) => {
	// ── HYDRATION GATE ────────────────────────────────────────────────────────
	//
	// TanStack Start sirve el HTML completo y hidrata después. Hasta que React
	// toma el control, el markup PARECE listo — cada label, input y botón que
	// este test quiere tocar ya existe — pero `onSubmit` no está conectado: el
	// click ejecuta el submit NATIVO del `<form>`, que es un GET a la misma URL.
	// Sin este gate el test falla de una forma que miente: la URL queda en
	// `/business-signup?` y los campos vacíos, o sea parece un bug del formulario
	// cuando la app está perfectamente sana.
	//
	// La señal es la query de config que la propia app dispara al hidratar
	// (`useConfig` → `GET /api/v1/app-config/public`, ver src/lib/queries.ts).
	// No puede ocurrir antes del commit que monta los componentes y corre sus
	// efectos, que es exactamente el commit que vuelve vivos los handlers del
	// formulario. Es un evento nombrado y observable — falla ruidosamente si la
	// app se rompe, y no es un timer.
	//
	// CÓMO se espera, y por qué no con `browser.waitForResponse`: ese waiter exige
	// una página ya abierta (`APP_NOT_OPEN` si se arma antes del `open`), y
	// armarlo DESPUÉS abre una carrera — la respuesta puede haber ocurrido
	// entre el `open` y el armaje. `expect.poll` sobre el buffer de Resource
	// Timing evita las dos: la entrada es un registro que PERMANECE después de
	// que la respuesta terminó, así que no hay ventana que perder sin importar
	// en qué momento se lee. Sigue siendo un evento nombrado —falla ruidosamente
	// si la app se rompe— y no un timer.
	//
	// Por qué no `expect(...)` sobre el heading: el heading de éxito solo existe
	// DESPUÉS del submit, así que esperarlo no dice nada sobre la hidratación.
	// La misma señal y el mismo argumento están en `e2e/fixtures.ts`
	// (`gotoHydrated`), que es la suite de Playwright y NO se toca.
	await app.open("/business-signup");
	await expect
		.poll(
			() =>
				browser.evaluate(() =>
					performance
						.getEntriesByType("resource")
						.some((entry) => entry.name.includes("/api/v1/app-config")),
				),
			{
				timeout: 30_000,
				message:
					"la app no hidrató: nunca consultó /api/v1/app-config después de abrir /business-signup",
			},
		)
		.toBe(true);

	await screen.getByLabel("Tu nombre *").fill(VALID.name);
	await screen.getByLabel("Email *").fill(VALID.email);
	await screen.getByLabel("Contraseña *").fill(VALID.password);
	await screen.getByLabel("Confirmar contraseña *").fill(VALID.password);
	await screen.getByLabel("Nombre del negocio *").fill(VALID.business);
	await screen.getByLabel("Teléfono").fill(VALID.phone);

	// ── THE SAFETY ASSERTION: the write went to loopback ─────────────────────
	//
	// `apps/landing/.env` apunta a un backend REAL de producción
	// (https://role-0hjz.onrender.com/api/v1). El heading de éxito de abajo
	// prueba que UN POST contractual devolvió 2xx — no prueba a QUIÉN le
	// escribió. Un test que verifica "el formulario postea" sin verificar "el
	// formulario posteó ACÁ" está a un refactor de distancia de crear un dueño de
	// negocio de verdad en producción, que es plata real y no un test rojo.
	//
	// Hoy el destino ya está fijado por la config (`serve.ts` pone
	// VITE_API_URL en el env del hijo, y el runner solo deja pasar
	// PATH/HOME/TMPDIR/TMP/TEMP/SystemRoot/COMSPEC más `command.env`, que acá no
	// está seteado: el VITE_API_URL del shell del dev no puede filtrarse). Eso
	// hace la suite MÁS hermética que la de Playwright — pero es una garantía
	// de la CONFIG, no del TEST, y una edición futura de `serve.ts` la rompería
	// en silencio. El repo ya insiste en esto: la suite hermana lo afirma en
	// `business-signup.spec.ts:176-178` ("The safety assertion: the write went
	// to loopback"), y esa línea es la razón por la que esa suite es segura.
	// Tasks 2 y 3 copian este archivo, así que el hazard viaja con él.
	//
	// armed ANTES del click (la página ya está abierta, así que acá sí se puede:
	// el problema de `APP_NOT_OPEN` del gate de hidratación no aplica), que es el
	// mismo orden que `waitForRequestTo(...)` seguido del click en el spec de
	// Playwright. Se espera DESPUÉS de las aserciones de destino de abajo, y por
	// eso queda al final a propósito — ver el comentario de ese bloque.
	const onboarding = browser.waitForResponse(/\/api\/v1\/businesses\/onboarding/, {
		timeout: 30_000,
	});
	await screen.getByRole("button", { name: "Registrar negocio" }).click();

	// ── ¿A DÓNDE fue? (Resource Timing, que NO depende de la respuesta) ───────
	//
	// Estas dos van PRIMERO y por una razón concreta: leen el historial de
	// URLs que la página ya pidió, así que contestan aunque la respuesta nunca
	// llegue. Un destino equivocado suele justamente NO producir respuesta —un
	// CORS preflight que no vuelve, un host que no resuelve, un 502— y en ese
	// caso el `waitForResponse` de abajo se LIMITARÍA a agotar 30 s y decir
	// "timeout", que es el mensaje menos útil del mundo para el bug más grave
	// posible. Con estas dos, el fallo dice en el primer segundo qué URL se usó.
	//
	// El buffer de Resource Timing ya se está leyendo en el gate de
	// hidratación, así que esto no agrega otra carrera ni otro mecanismo.
	const onboardingUrls = () =>
		browser.evaluate(() =>
			performance
				.getEntriesByType("resource")
				.map((entry) => entry.name)
				.filter((name) => name.includes("/businesses/onboarding")),
		);

	// (a) Que haya exactamente una: sin esto, "ninguna URL fuera de loopback"
	// pasaría en verde con CERO requests — un verde que no probó nada. Esta
	// línea es la que hace que la de abajo no sea vacua.
	await expect
		.poll(onboardingUrls, {
			timeout: 30_000,
			message:
				"el click no produjo ningún POST a /businesses/onboarding: el formulario no se envió",
		})
		.toHaveLength(1);

	// (b) Y que ese uno sea loopback. El fallo lista la URL culpable, que es
	// justo lo que hay que leer para entender qué se rompió.
	await expect
		.poll(
			async () => (await onboardingUrls()).filter((url) => !url.includes(LOOPBACK)),
			{
				timeout: 10_000,
				message:
					"el POST de onboarding fue a un destino que NO es el stub de loopback (la lista del fallo lo muestra): este test está escribiendo en el backend de producción",
			},
		)
		.toEqual([]);

	// Ahora sí, la respuesta: el 201 también importa, porque el stub valida el
	// body con OnboardingBusinessRequestSchema y devuelve 400 si no cierra
	// (e2e/stub-api.ts:124-129). Un 201 prueba que el payload se trató como
	// contrato y no solo que "algo respondió".
	const posted = await onboarding;
	await expect(posted.status, "el stub no devolvió 201 al onboarding").toBe(201);
	await expect(posted.url, "la respuesta de onboarding no vino del stub").toContain(
		LOOPBACK,
	);

	// El alert `role="alert"` solo se renderiza cuando hay `error`, y el stub
	// responde 201: la ruta entra al camino de éxito y muestra este heading.
	await expect(
		screen.getByRole("heading", { name: "¡Recibimos tu solicitud!" }),
	).toBeVisible();
});
