import { describe, expect, test } from "bun:test";
import { navMain } from "../navigation";

/**
 * A11: `NavMain` renderiza un `<Link to={item.url}>` para toda entrada sin
 * sub-items, así que un `url: "#"` era una entrada visible que no lleva a
 * ninguna parte. Este test es la barrera: si alguien re-add un placeholder, el
 * menú vuelve a prometer una ruta inexistente.
 */
function collectUrls(): Array<{ title: string; url: string }> {
	const out: Array<{ title: string; url: string }> = [];
	for (const item of navMain) {
		if (item.items?.length) {
			for (const sub of item.items)
				out.push({ title: sub.title, url: sub.url });
			continue;
		}
		out.push({ title: item.title, url: item.url });
	}
	return out;
}

describe("navegación del sidebar", () => {
	test("ninguna entrada apunta a '#'", () => {
		const placeholders = collectUrls().filter((e) => e.url.trim() === "#");
		expect(placeholders).toEqual([]);
	});

	test("no hay entradas de menú sin ruta", () => {
		for (const entry of collectUrls()) {
			expect(entry.url.startsWith("/")).toBe(true);
		}
	});

	// Los grupos con sub-items siguen usando "#" como url decorativa (no se
	// navega); lo que no puede pasar es que un sub-item sea un placeholder.
	test("los grupos con sub-items no exponen placeholders a la vista", () => {
		const groups = navMain.filter((item) => item.items?.length);
		expect(groups.length).toBeGreaterThan(0);
		for (const group of groups) {
			for (const sub of group.items ?? []) {
				expect(sub.url).not.toBe("#");
			}
		}
	});

	// Las superficies operativas de órdenes y ofertas tienen que estar
	// alcanzables desde el menú: sin entradas, el panel no las tiene.
	// Nota: aquí NO se contrasta contra `routeTree.gen` porque los specs de
	// rutas mockean `@tanstack/react-router` para toda la corrida y
	// `mock.module` no se revierte con `mock.restore()`; importar el árbol ahí
	// rompe la suite completa.
	test("órdenes y ofertas tienen entrada de menú con ruta propia", () => {
		const urls = collectUrls().map((e) => e.url);
		expect(urls).toContain("/ordenes");
		expect(urls).toContain("/ofertas");
	});
});
