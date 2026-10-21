import { beforeEach, expect, jest, mock, test } from "bun:test";
import * as realReact from "react";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

/**
 * El sello de la sesión de staff CON el negocio resuelto (§5.2).
 *
 * ─── POR QUÉ HACE FALTA CUANDO YA HAY UN SELLO ────────────────────────────────
 *
 * El login sella la sesión, pero sin negocio: la BASE la resuelve cuando la
 * persona tiene exactamente una membresía viva. Con dos o más —el dueño real
 * tiene seis negocios en producción— la respuesta es `multiple_businesses` y
 * NO se sella nada. Quien abre el panel de un negocio, en cambio, ya sabe
 * cuál es: por eso el sello se repite aquí, con el negocio en el cuerpo.
 *
 * ─── POR QUÉ ESTO ES UN HOOK Y NO LA PANTALLA ─────────────────────────────────
 *
 * Porque la ruta no se puede exertar con el arnés del repo: `renderToStaticMarkup`
 * no corre efectos, y una ruta es una pantalla con navegación. El efecto vive
 * en un hook de `src/`, que sí se monta, y la pantalla lo llama. Lo que se
 * afirma aquí es lo que la pantalla necesita: que se sella CON el negocio, que
 * sin negocio no se sella nada, y que un sello que no resuelve no rompe nada.
 */

/** El doble del sello: se guarda lo que se le pasó y lo que devolvió. */
const stampStaffSession = jest.fn(async (_businessId?: string) => null);

/**
 * Los efectos capturados.
 *
 * `renderToStaticMarkup` no corre los efectos, así que el doble de `useEffect`
 * los RECOGE y el test los corre a mano: el efecto que se afirma es el que se
 * ejecutó, no el que se escribió.
 */
const effects: Array<() => unknown> = [];

mock.module("@/src/features/auth/data/staff-session", () => ({
	stampStaffSession,
}));

mock.module("react", () => ({
	...realReact,
	useEffect: (effect: () => unknown) => {
		effects.push(effect);
	},
}));

const { useStaffSessionStamp } = await import("./use-staff-session-stamp");

/** La pantalla que monta el hook: es lo que el arnés puede exertar. */
function Screen({ businessId }: { businessId?: string }) {
	useStaffSessionStamp(businessId);
	return createElement(nativeWeb.Text, null, "PANTALLA");
}

/** Monta la pantalla y corre el efecto que capturó. */
async function montar(businessId?: string): Promise<string> {
	const html = renderToStaticMarkup(
		createElement(Screen, businessId ? { businessId } : {}),
	);
	// El efecto se corre a mano: el renderizador de servidor no lo corre.
	await effects[0]?.();
	return html;
}

beforeEach(() => {
	effects.length = 0;
	stampStaffSession.mockClear();
});

test("con negocio se sella esa membresía y sólo esa", async () => {
	const html = await montar("business-1");

	expect(stampStaffSession).toHaveBeenCalledTimes(1);
	expect(stampStaffSession).toHaveBeenCalledWith("business-1");
	expect(html).toContain("PANTALLA");
});

test("sin negocio no se sella nada", async () => {
	await montar();

	expect(stampStaffSession).not.toHaveBeenCalled();
});

test("un sello que no resuelve no rompe la pantalla", async () => {
	stampStaffSession.mockResolvedValueOnce(null);

	const html = await montar("business-1");

	// El sello se intentó…
	expect(stampStaffSession).toHaveBeenCalledWith("business-1");
	// …y la pantalla sigue en pie: el sello es un problema del aparato, no un
	// motivo para echar a quien acaba de entrar.
	const pendiente = stampStaffSession.mock.results[0]?.value;
	await pendiente;
	expect(html).toContain("PANTALLA");
});
