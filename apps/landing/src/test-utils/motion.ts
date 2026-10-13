/**
 * Instala y desinstala el `matchMedia` que el hook consulta.
 *
 * Happy-dom no lo implementa, y el hook lo necesita para decidir entre "contar"
 * y "saltar al final". Que sea un helper y no un `Object.defineProperty`
 * repetido en cada test es lo que permite que el cleanup se olvide: si el
 * mock se filtra, el siguiente test que animate hereda el "movimiento reducido"
 * de otro y falla con un motivo que no tiene nada que ver con el suyo.
 */

type MediaListener = (event: MediaQueryListEvent) => void;

interface StubMediaQueryList extends MediaQueryList {
	__setMatches: (matches: boolean) => void;
}

const LISTENERS = new Set<MediaListener>();

const matchesRef = { current: false };

export function setReducedMotion(reduce: boolean): void {
	matchesRef.current = reduce;
}

export function teardownMotion(): void {
	matchesRef.current = false;
	LISTENERS.clear();
}

function makeQueryList(query: string): StubMediaQueryList {
	const listeners = new Set<MediaListener>();
	LISTENERS.add((event) => {
		for (const l of listeners) l(event);
	});
	return {
		get matches() {
			return query.includes("reduced-motion") ? matchesRef.current : false;
		},
		media: query,
		onchange: null,
		addEventListener: (_: string, l: MediaListener) => listeners.add(l),
		removeEventListener: (_: string, l: MediaListener) => listeners.delete(l),
		addListener: (l: MediaListener) => listeners.add(l),
		removeListener: (l: MediaListener) => listeners.delete(l),
		dispatchEvent: () => true,
		__setMatches: (next: boolean) => {
			if (query.includes("reduced-motion")) matchesRef.current = next;
			for (const l of listeners) {
				l({ matches: next, media: query } as MediaQueryListEvent);
			}
		},
	} as StubMediaQueryList;
}

/**
 * Instala `window.matchMedia`. Devuelve la función de remoção para que el
 * caller pueda restaurar el original aunque el test no llegue al `finally`.
 */
/**
 * Instala `matchMedia`. Devuelve la función de remoção para que el caller
 * pueda restaurar el original aunque el test no llegue al `finally`.
 *
 * Se instala en `window` Y en `globalThis`, y esa duplicación no es paranoia:
 * con happy-dom son objetos distintos. Un stub puesto solo en `globalThis`
 * deja `window.matchMedia` como lo que venga —el de happy-dom o `undefined`— y
 * un hook que consulta `window.matchMedia` nunca lo ve. El síntoma es un test
 * de movimiento reducido que pasa sin haber ejecutado la rama que dice probar,
 * porque el primer render devuelve el valor final igual: ese es el estado
 * inicial del hook, con o sin `prefers-reduced-motion`.
 */
export function stubMatchMedia(): () => void {
	const factory = ((query: string) =>
		makeQueryList(query)) as unknown as typeof window.matchMedia;

	const g = globalThis as Record<string, unknown>;
	const previousGlobal = g.matchMedia;
	const win = g.window as Record<string, unknown> | undefined;
	const previousWindow = win?.matchMedia;

	g.matchMedia = factory;
	if (win) win.matchMedia = factory;

	return () => {
		g.matchMedia = previousGlobal;
		if (win) win.matchMedia = previousWindow;
	};
}

/** Deja `matchMedia` en false y listo para el próximo test. */
export function resetMotion(): void {
	teardownMotion();
	stubMatchMedia();
}
