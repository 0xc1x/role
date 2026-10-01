import { describe, expect, test } from "bun:test";
import { parseBugReportsSearch } from "../_layout.reportes";

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
