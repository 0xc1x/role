import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const VALID = {
	name: "Ada Lovelace",
	email: "ada@e2e.example",
	password: "sup3rsecreta",
	business: "Panadería La Espiga",
	phone: "+593 99 123 4567",
};

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

	await screen.getByRole("button", { name: "Registrar negocio" }).click();

	// El alert `role="alert"` solo se renderiza cuando hay `error`, y el stub
	// responde 201: la ruta entra al camino de éxito y muestra este heading.
	await expect(
		screen.getByRole("heading", { name: "¡Recibimos tu solicitud!" }),
	).toBeVisible();
});
