import { describe, expect, test } from "bun:test";
import { navMain } from "@/config/navigation";
import { isNavItemActive } from "@/lib/nav-active";

/**
 * El resaltado del sidebar se decide sobre la RUTA, no sobre la URL completa.
 *
 * Notificaciones y Campañas son las dos entradas con sub-items, y las dos
 * cuelgan de una sección colapsable. Las cuatro pestañas de Notificaciones
 * (`enviar`, `plantillas`, `historial`, `dispositivos`) viajan en `?tab=`, así
 * que la URL es toda la máquina de estado de esa pantalla: con la comparación
 * completa, cambiar de pestaña desmarcaba el ícono y cerraba la sección. El
 * operador veía el menú perder el resaltado en mitad de una tarea, y no había
 * ninguna acción suya que lo explicara.
 *
 * Estos tests fijan la regla, no el render: `NavMain` depende de
 * `useLocation` y el repo no tiene arnés de router en los tests, así que la
 * parte que se prueba aquí es la decisión, que es donde estaba el defecto.
 */
describe("resaltado del sidebar", () => {
	test("una ruta con query sigue activa al cambiar ?tab=", () => {
		// El caso que rompió: la pestaña es la mitad de lo que el operador hace
		// en esa pantalla, y el ícono tiene que quedarse.
		expect(
			isNavItemActive(
				"/notificaciones/push",
				"/notificaciones/push",
				"/notificaciones/push?tab=historial",
			),
		).toBe(true);
		expect(
			isNavItemActive(
				"/notificaciones/mails",
				"/notificaciones/mails",
				"/notificaciones/mails?tab=enviar",
			),
		).toBe(true);
	});

	test("sin query sigue siendo una comparación exacta", () => {
		// La tolerancia al query no puede volverse tolerancia al prefijo: si no,
		// /ofertas encendería también en /ofertas/archivadas.
		expect(isNavItemActive("/ofertas", "/ofertas", "/ofertas")).toBe(true);
		expect(
			isNavItemActive("/ofertas", "/ofertas/archivadas", "/ofertas/archivadas"),
		).toBe(false);
		expect(isNavItemActive("/negocios", "/ordenes", "/ordenes")).toBe(false);
	});

	test("un ítem que declara query tiene que coincidir entero", () => {
		// Ningún ítem del menú lleva query hoy. La regla no debe depender de eso:
		// si mañana uno la declara, es porque la query ES lo que lo distingue, y
		// entonces `/x?tab=a` no puede encender `/x?tab=b`.
		expect(
			isNavItemActive(
				"/campanas/mails?tab=enviados",
				"/campanas/mails",
				"/campanas/mails?tab=pendientes",
			),
		).toBe(false);
		expect(
			isNavItemActive(
				"/campanas/mails?tab=enviados",
				"/campanas/mails",
				"/campanas/mails?tab=enviados",
			),
		).toBe(true);
	});

	test("la sección con sub-items se abre y se marca desde cualquiera de sus hijos", () => {
		// `isSubItemActive` alimenta dos cosas a la vez: el `isActive` del
		// trigger y el `defaultOpen` del Collapsible. Si se apaga, el operador
		// además de perder el resaltado llega a una sección cerrada tras
		// recargar, con el hijo activo escondido dentro.
		const notificaciones = navMain.find((i) => i.title === "Notificaciones");
		expect(notificaciones).toBeDefined();

		const hijoActivo = (pathname: string, currentUrl: string) =>
			notificaciones?.items?.some((sub) =>
				isNavItemActive(sub.url, pathname, currentUrl),
			);

		for (const sub of notificaciones?.items ?? []) {
			expect(hijoActivo(sub.url, sub.url)).toBe(true);
			// Y con la query de la pestaña puesta, que es el estado real.
			expect(hijoActivo(sub.url, `${sub.url}?tab=historial`)).toBe(true);
		}

		// Fuera de la sección, nada se enciende.
		expect(hijoActivo("/negocios", "/negocios?tab=x")).toBe(false);
	});

	test("ninguna ruta de sub-item depende del query para estar activa", () => {
		// Guarda contra la tentación de volver a comparar la URL completa "solo
		// para Notificaciones": sería el mismo defecto con más código.
		for (const item of navMain) {
			for (const sub of item.items ?? []) {
				expect(sub.url).not.toContain("?");
			}
		}
	});
});
