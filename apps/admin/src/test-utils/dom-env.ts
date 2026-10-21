import { Window } from "happy-dom";

/**
 * El entorno DOM de los tests del admin, en un solo lugar y con una sola regla:
 * se instala ANTES de que se cargue cualquier módulo bajo prueba.
 *
 * ─── POR QUÉ ANTES Y NO CUANDO SE IMPORTE EL HELPER ────────────────────────
 *
 * `@base-ui/utils` decide en el ÁMBITO DEL MÓDULO si hay DOM:
 * `useIsoLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : noop`
 * (`@base-ui/utils/useIsoLayoutEffect.mjs`). Esa decisión se toma cuando se
 * importa el paquete, y en bun el registro de módulos es del PROCESO: el primer
 * spec que carga base-ui decide el modo de los noventa y dos.
 *
 * El helper de DOM (`test-utils/dom.ts`) instala el DOM al ser importado, y cada
 * spec lo importa donde le place. Hay specs que importan el componente bajo
 * prueba ANTES que el helper —`offers.columns.test.tsx` importa el `DataTable`
 * antes que `@/test-utils/dom`— y en esos casos base-ui se carga sin `document`:
 * queda en modo SSR (`useLayoutEffect` es un noop) y sus portales no abren, así
 * que `findByRole("menu")` esperaba y expiraba. Medido: ese spec pasa 8/8 si el
 * helper se importa antes del componente y falla 4/8 al revés.
 *
 * Y como el orden de archivos lo da el filesystem, la suite era una ruleta: el
 * mismo commit daba 642/642 en un clon y 423 pass / 129 fail en otro, con 92
 * archivos en los dos casos.
 *
 * El entorno se instala desde el PRELOAD (`test-preload.ts`), que bun ejecuta
 * antes de importar el primer spec: el DOM existe antes de que se cargue
 * base-ui, siempre, en cualquier orden.
 */
export function installDomEnvironment(): void {
	const g = globalThis as unknown as Record<string, unknown>;

	// `window` ES `globalThis`: bun no lo trae, y el panel lee `window.location`
	// y `window.localStorage`. Que sea el global y no la ventana de happy-dom es
	// a propósito —los specs redefinen `globalThis.location` y esperan que
	// `window.location` sea ese mismo objeto (ver `session-expiry.test.ts`).
	if (!g.window) g.window = globalThis;
	const w = g.window as Record<string, unknown>;
	if (!w.location) w.location = { href: "" };

	/**
	 * POR QUÉ ESTE SHIM: `lib/api/client.ts` resuelve el storage con un
	 * `localStorage` global y lo trata fail-safe (`getStorage()` lo envuelve en
	 * try/catch y devuelve `undefined` si no existe), así que sin este objeto el
	 * cliente queda mudo en silencio: los helpers de token devuelven `null` y los
	 * specs de auth mueren en `beforeEach` con `TypeError: undefined is not an
	 * object` al hacer `window.localStorage.clear()`. Es el mismo shim que ya se
	 * armaba a mano en `client.test.ts`, patrón que se conserva: se define en
	 * `window` Y en `globalThis` porque son objetos distintos siempre que otro
	 * spec sustituya `window` por la ventana de happy-dom, y el código bajo
	 * prueba lee el global.
	 *
	 * Solo los accesos que el panel usa; `length` y `key` están porque un
	 * `Storage` que los omite no es sustituible por uno real y el primer consumer
	 * que introspeccione las claves (sonda de persistencia, tests) fallaría por
	 * un motivo equivocado. `getItem` devuelve `null` —no `undefined`— por la
	 * misma razón: es lo que distingue "no está" de "está con valor vacío".
	 */
	if (!w.localStorage) {
		const store = new Map<string, string>();
		const storage = {
			get length() {
				return store.size;
			},
			key(index: number) {
				return [...store.keys()][index] ?? null;
			},
			getItem(key: string) {
				return store.get(key) ?? null;
			},
			setItem(key: string, value: string) {
				store.set(key, String(value));
			},
			removeItem(key: string) {
				store.delete(key);
			},
			clear() {
				store.clear();
			},
		};
		w.localStorage = storage;
		g.localStorage = storage;
	}

	// El DOM de happy-dom. Va después del shim de storage a propósito: el
	// documento es lo que decide el modo de base-ui, y el shim cubre código que
	// lee `window` sin DOM (el cliente HTTP).
	if (!g.document) {
		const happy = new Window({ url: "http://localhost/" });
		g.document = happy.document;
		g.navigator ??= happy.navigator;
		g.HTMLElement ??= happy.HTMLElement;
		g.Element ??= happy.Element;
		g.Node ??= happy.Node;
		g.Event ??= happy.Event;
		g.CustomEvent ??= happy.CustomEvent;
		g.getComputedStyle ??= happy.getComputedStyle.bind(happy);
		g.MutationObserver ??= happy.MutationObserver;
		// `HTMLIFrameElement` en el global, no en el window: el `window` global lo
		// puso el shim de arriba (es `globalThis`, para que los specs que leen
		// `window.x` como el panel.findan el shim de storage). React lo lee del
		// global en `getActiveElementDeep`, así que con el shim tal cual, montar
		// sobre `document` —lo que necesita un componente que renderiza `<html>`—
		// moría con `TypeError: Right hand side of instanceof is not an object`.
		g.HTMLIFrameElement ??= happy.HTMLIFrameElement;
		// Base UI usa requestAnimationFrame para transiciones (happy-dom no lo
		// define).
		if (typeof g.requestAnimationFrame !== "function") {
			g.requestAnimationFrame = ((cb: FrameRequestCallback) =>
				setTimeout(() => cb(Date.now()), 0)) as unknown;
			g.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as unknown;
		}
	}
}
