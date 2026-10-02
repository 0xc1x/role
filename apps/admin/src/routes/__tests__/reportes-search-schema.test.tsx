import { afterEach, describe, expect, mock, test } from "bun:test";

/**
 * El `mock.module` es OBLIGATORIO acá, y no por comodidad.
 *
 * `mock.module` de bun es GLOBAL al proceso y `bun test src` corre los specs sin
 * `--isolate`, así que si otro spec mockea `@tanstack/react-router` antes que
 * este, su `createFileRoute` —que devuelve las options en el PRIMER nivel en vez
 * de en `Route.options`— es el que construye la ruta. Medido: sin este mock, el
 * orden de los specs decidía el resultado y, en el orden de la suite completa,
 * el archivo entero tiraba `TypeError: undefined is not an object (evaluating
 * 'Route.options.validateSearch')` — y bun reportaba la corrida como VERDE, con
 * el "Unhandled error between tests" en otro lado de la salida. Un test que
 * depende del orden y falla en silencio es peor que no tener test.
 *
 * El mock reexporta el módulo real porque bun comparte el registro entre specs y
 * un mock que esconde exports rompe a los hermanos. Es el mismo bloque que
 * `_layout.home` y `list-route-retry.test.tsx` ya usan; la diferencia es que
 * aquellos leen `route.component` del primer nivel y este lee
 * `route.validateSearch`, que es lo que quiere fijar.
 */
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => ({}),
		useNavigate: () => () => undefined,
	}),
	useNavigate: () => () => undefined,
	redirect: () => undefined,
	// `Link` del router real exige un `RouterProvider`; el `errorComponent` lo usa
	// para la salida "Ir al inicio". El mismo stub que `_layout.home` ya usa.
	Link: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<a href="/home" {...props}>
			{children}
		</a>
	),
}));

// `parseBugReportsSearch` vive en el FEATURE y no en la ruta, por dos razones que
// este spec es el primero que va a sufrir si vuelve atrás. La primera es que
// `export` desde un archivo de ruta rompe el code-splitting de esa ruta, y el
// build lo avisa ("will not be code-split and will increase your bundle size").
// La segunda es que `react-doctor` marca `only-export-components`: la ruta es un
// componente, y un helper de parseo exportado desde ahí no lo es.
//
// Importarlo por el MÓDULO y no por la ruta es lo que hace que el test siga
// probando lo que dice: este archivo monta la ruta para el `errorComponent` y
// llama al helper directo, sin router.
const { parseBugReportsSearch } = await import(
	"@/features/bug-reports/queries/bug-reports.search"
);
const { Route } = await import("../_layout.reportes");
// `ReportesError` se importa del FEATURE y no de la ruta a propósito: mismo
// motivo de code-splitting, y el test del componente tiene que vivir donde el
// componente vive.
const { ReportesError } = await import("@/features/bug-reports");

const { cleanup, fireEvent, render, screen } = await import("@/test-utils/dom");

afterEach(() => {
	cleanup();
	mock.restore();
});

/** El `validateSearch` que la RUTA declara, no el helper suelto. */
const validateSearch = (
	Route as unknown as {
		validateSearch: (raw: Record<string, unknown>) => unknown;
	}
).validateSearch;

/**
 * El search de `/reportes` NO es `ListBugReportsQuerySchema.parse` pelado.
 *
 * Un `?state=REABIERTO` dentro del `parse` revienta `validateSearch`, el router
 * lo envuelve en `SearchParamError` y reemplaza la página ENTERA por el
 * "Something went wrong!" de TanStack Router. Eso no es una hipótesis en esta
 * sección: el contrato declara que `app_store.state` es `text` sin CHECK, que el
 * mapper lo estrecha a `null` sin lanzar, y que `null` significa "sin triar" *o*
 * "estado desconocido". El operador que ve "Sin triar" y quiere saber por qué
 * pega el token en la URL, y con el `parse` pelado eso le tira el panel abajo.
 *
 * Por eso el test va contra `parseBugReportsSearch` y no contra el schema de
 * commons: lo que se quiere fijar es el comportamiento de ESTA ruta, y el
 * schema solo no lo tiene.
 */
describe("el search de /reportes no reemplaza la página por un token desconocido", () => {
	test("un estado fuera del vocabulario se vuelve 'sin filtro', no una excepción", () => {
		const result = parseBugReportsSearch({ state: "REABIERTO" });
		expect(result.state).toBeUndefined();
		expect(result.page).toBe(1);
		expect(result.limit).toBe(20);
	});

	test("un origen fuera del vocabulario también", () => {
		const result = parseBugReportsSearch({ origin: "web_legacy" });
		expect(result.origin).toBeUndefined();
	});

	test("el token malo no se lleva por delante los filtros buenos", () => {
		// El punto de no usar `catch` sobre el schema entero: un `?state=` roto
		// tiene que costar SÓLO el filtro de estado. Con un catch global se
		// perderían también el origin y la paginación.
		const result = parseBugReportsSearch({
			state: "REABIERTO",
			origin: "ios",
			page: "3",
			limit: "50",
		});
		expect(result.state).toBeUndefined();
		expect(result.origin).toBe("ios");
		expect(result.page).toBe(3);
		expect(result.limit).toBe(50);
	});

	test("los tokens del contrato siguen pasando", () => {
		const result = parseBugReportsSearch({
			state: "EN_REPRODUCCION",
			origin: "android",
		});
		expect(result.state).toBe("EN_REPRODUCCION");
		expect(result.origin).toBe("android");
	});

	test("la paginación inválida SIGUE tirando, como en las otras rutas", () => {
		// Acá no se limpia nada: `?page=0` no lo escribe un operador por error en
		// un filtro de triaje, y tragárselo convertiría un error visible en un
		// default silencioso. Es el límite explícito de esta corrección.
		expect(() => parseBugReportsSearch({ page: "0" })).toThrow();
		expect(() => parseBugReportsSearch({ limit: "200" })).toThrow();
	});
});

/**
 * El CABLEADO, que es lo que el bloque de arriba no ata.
 *
 * Con solo los tests del helper, revertir la línea
 * `validateSearch: (raw) => parseBugReportsSearch(raw)` a
 * `ListBugReportsQuerySchema.parse(raw)` —el bug exacto que la corrección
 * arregla— dejaba la suite en verde. El helper podía estar perfecto y nadie lo
 * estar usando, que es un test del helper, no del comportamiento.
 */
describe("la ruta tiene su propio errorComponent", () => {
	test("está declarado en la ruta", () => {
		// Ninguna ruta del panel lo declaraba. Esa era la estrategia correcta
		// mientras el único error posible fuera de red, que entra por la rama
		// `isError` del componente; dejó de alcanzar cuando un `value` de la fila
		// —que el panel no controla— se renderiza y puede hacer throw en render.
		const route = Route as unknown as { errorComponent?: unknown };
		expect(typeof route.errorComponent).toBe("function");
	});

	test("muestra el error y ofrece dos salidas, sin quedarse a medias", () => {
		// Lo que se verifica no es que exista el componente sino qué garantiza: un
		// throw de render de ESTA sección no sube al `CatchBoundary` del root, que
		// es el que reemplaza el documento entero y se lleva la barra lateral.
		let reseteos = 0;
		render(
			<ReportesError
				error={new Error("Invalid time value")}
				reset={() => reseteos++}
			/>,
		);

		// `getByText` es de coincidencia EXACTA sobre el texto normalizado, así que
		// la aserción lleva la frase completa y no una parte: es el copy entero el
		// que asegura que el operador sepa que el resto del panel sigue vivo, y
		// una aserción sobre un fragmento pasaría con cualquier reescritura.
		expect(
			screen.getByText(
				"No se pudo mostrar el buzón de reportes. El resto del panel sigue funcionando.",
			),
		).toBeDefined();
		// El mensaje del error llega: es lo que el operador le pasa a soporte, y
		// sin él el aviso es "algo falló" sin nada que correlacionar.
		expect(screen.getByText("Invalid time value")).toBeDefined();
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
		// `Button render={<Link/>}` —el patrón que ya usa `nav-main.tsx`— deja el
		// `role="button"` de Base UI sobre el `<a>`, así que la salida se busca por
		// rol de botón y no de link. Lo que se verifica es que la salida EXISTE y
		// lleva a otra sección, no la semántica que le pone la librería.
		const salida = screen.getByRole("button", { name: "Ir al inicio" });
		expect(salida.getAttribute("href")).toBe("/home");
	});

	test("'Reintentar' vuelve a montar, que es lo que un error de render pide", () => {
		// No es un `navigate`: un error de render se resuelve volviendo a intentar
		// el render, no cambiando de sección.
		let reseteos = 0;
		render(
			<ReportesError error={new Error("boom")} reset={() => reseteos++} />,
		);
		fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
		expect(reseteos).toBe(1);
	});

	test("un error sin mensaje no rompe ni deja un hueco", () => {
		// Un `catch` que reventara por leer un `message` vacío sería el mismo bug
		// que vino a tapar, y es un caso real: muchos `throw` de libraries no
		// traen mensaje.
		render(<ReportesError error={new Error("   ")} reset={() => undefined} />);
		expect(
			screen.getByText(
				"No se pudo mostrar el buzón de reportes. El resto del panel sigue funcionando.",
			),
		).toBeDefined();
		expect(screen.queryByText("   ")).toBeNull();
	});
});

describe("la ruta USA el saneador, no el parse pelado", () => {
	test("el validateSearch de la ruta es el que tolera un token desconocido", () => {
		// Y no se cumple "sin tirar" por casualidad: se cumple porque se ejecuta
		// la función que la ruta declara, no una copia del helper.
		expect(() => validateSearch({ state: "REABIERTO" })).not.toThrow();
		expect(validateSearch({ state: "REABIERTO" })).toMatchObject({
			state: undefined,
		});
	});

	test("se comporta como el helper, y no como el parse pelado", () => {
		// `toBe` sobre la función sería demasiado fuerte: la ruta podría
		// envolverla legítimamente. Lo que importa es que se comporten igual, y
		// esto lo prueba con un input donde las dos implementaciones difieren.
		expect(validateSearch({ origin: "web_legacy", page: "2" })).toEqual(
			parseBugReportsSearch({ origin: "web_legacy", page: "2" }),
		);
	});
});
