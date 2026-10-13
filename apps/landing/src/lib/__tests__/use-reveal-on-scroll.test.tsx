/**
 * ─── Por qué este archivo tiene dos describes ──────────────────────────────────
 *
 * El bug era una carrera entre el effect de la RAÍZ y la hidratación del
 * subárbol de la ruta: las rutas de archivo van detrás de `lazyRouteComponent`,
 * así que el root route —que NO es lazy— se hidrata y corre sus effects primero,
 * y su `IntersectionObserver` escribía `data-revealed` en nodos a los que React
 * todavía no les había puesto su `__reactFiber$`. React los hidrataba después,
 * encontraba un atributo que no estaba en sus props, y reportaba el mismatch.
 *
 * Esa carrera NO es reproducible en dos de los tres lugares donde podría
 * vivirla:
 *
 *  · happy-dom no hidrata, no tiene fronteras lazy y no hay orden de commit
 *    que saber. El bug es invisible ahí.
 *  · React borra `diffHydratedProperties` de los builds de producción
 *    (verificado: 0 ocurrencias en `react-dom-client.production.js`), y la
 *    suite e2e de la landing corre contra `build && vite preview`. Un test e2e
 *    que mirara el console passaría con el bug puesto.
 *
 * Lo que SÍ es medible en las dos plataformas es la INVARIANTE que el bug
 * violaba: React no es dueño del DOM de un hijo hasta que esa frontera
 * hidrata. El `describe` de arriba la fija sobre el hook —que es donde vive la
 * escritura— y el de abajo fija el CABLEADO que la hace cumplir: la escritura
 * no puede volver a la raíz, y toda ruta con `.reveal` tiene que llamar al
 * hook. Es una aserción de fuente a propósito, y es la misma forma que usa
 * `announcement-banner.test.tsx`: el comportamiento va arriba, el cableado acá.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { cleanup, render } from "@/test-utils/dom";
import { useRevealOnScroll } from "../use-reveal-on-scroll";

/** IntersectionObserver que el test maneja a mano: sin browser no hay viewport. */
class FakeIntersectionObserver {
	static instances: FakeIntersectionObserver[] = [];

	readonly observed = new Set<Element>();
	disconnected = false;

	constructor(
		private readonly callback: IntersectionObserverCallback,
		readonly options?: IntersectionObserverInit,
	) {
		FakeIntersectionObserver.instances.push(this);
	}

	observe(el: Element): void {
		this.observed.add(el);
	}
	unobserve(el: Element): void {
		this.observed.delete(el);
	}
	disconnect(): void {
		this.disconnected = true;
		this.observed.clear();
	}
	takeRecords(): MutationRecord[] {
		return [];
	}

	/** Dispara el callback como lo haría el browser con estos nodos entrando. */
	enter(...targets: Element[]): void {
		const entries = targets.map(
			(target) =>
				({ target, isIntersecting: true }) as IntersectionObserverEntry,
		);
		this.callback(entries, this as unknown as IntersectionObserver);
	}
}

/** MutationObserver que solo cuenta, para poder dispararlo a mano. */
class FakeMutationObserver {
	readonly observed: Element[] = [];
	disconnected = false;
	constructor(private readonly callback: MutationCallback) {
		FakeMutationObserver.instances.push(this);
	}

	observe(target: Element): void {
		this.observed.push(target);
	}
	disconnect(): void {
		this.disconnected = true;
	}
	takeRecords(): MutationRecord[] {
		return [];
	}
	fire(): void {
		this.callback([], this as unknown as MutationObserver);
	}
	static last(): FakeMutationObserver | undefined {
		return FakeMutationObserver.instances.at(-1);
	}
	static instances: FakeMutationObserver[] = [];
}

function Probe() {
	useRevealOnScroll();
	return (
		<div>
			<div className="reveal reveal-delay-1" data-testid="a" />
			<div className="reveal" data-testid="b" />
			<div data-testid="c" />
		</div>
	);
}

/** Sin `!`: el repo lo prohíbe, y acá cada `!` escondía un fallo real. */
const observer = () => {
	const io = FakeIntersectionObserver.instances.at(-1);
	if (!io) throw new Error("el hook no construyó un IntersectionObserver");
	return io;
};

const mutacion = () => {
	const mo = FakeMutationObserver.last();
	if (!mo) throw new Error("el hook no construyó un MutationObserver");
	return mo;
};

/** El nodo del `Probe`, o un fallo que dice cuál no apareció. */
const nodo = (testid: string) => {
	const el = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
	if (!el) throw new Error(`el Probe no renderizó [data-testid="${testid}"]`);
	return el;
};

describe("useRevealOnScroll", () => {
	beforeEach(() => {
		FakeIntersectionObserver.instances = [];
		FakeMutationObserver.instances = [];
		globalThis.IntersectionObserver =
			FakeIntersectionObserver as unknown as typeof IntersectionObserver;
		globalThis.MutationObserver =
			FakeMutationObserver as unknown as typeof MutationObserver;
	});

	afterEach(() => cleanup());

	test("observa solo los `.reveal` que faltan revelar", () => {
		render(<Probe />);
		const a = nodo("a");
		const b = nodo("b");
		const c = nodo("c");
		// Comparación por identidad y no `toEqual` sobre el Set: bun igualaría
		// los nodos del DOM en profundidad, y no hay razón para que un test de
		// "lo observé" recorra un árbol entero de happy-dom.
		expect(observer().observed.size).toBe(2);
		expect(observer().observed.has(a)).toBe(true);
		expect(observer().observed.has(b)).toBe(true);
		// El tercer div no tiene `.reveal`: observarlo sería trabajo de más.
		expect(observer().observed.has(c)).toBe(false);
		expect(observer().options).toEqual({
			threshold: 0.1,
			rootMargin: "0px 0px -50px 0px",
		});
	});

	test("al entrar en viewport marca `data-revealed` y deja de observar", () => {
		render(<Probe />);
		const a = nodo("a");
		const b = nodo("b");

		observer().enter(a);

		expect(a.dataset.revealed).toBe("true");
		expect(b.dataset.revealed).toBeUndefined();
		// Dejar de observar es lo que evita repetir el trabajo en cada scroll.
		expect(observer().observed.has(a)).toBe(false);
		expect(observer().observed.has(b)).toBe(true);
	});

	test("no vuelve a observar lo que ya está revelado", () => {
		render(<Probe />);
		const a = nodo("a");
		a.dataset.revealed = "true";
		FakeIntersectionObserver.instances = [];

		cleanup();
		render(<Probe />);

		expect(observer().observed.has(a)).toBe(false);
	});

	test("recoge los `.reveal` que aparecen después de montado", async () => {
		// Es lo que hace que el acordeón de la home y el footer de una ruta
		// nueva revelen sin que nadie los invoque a mano.
		render(<Probe />);
		const tarde = document.createElement("div");
		tarde.className = "reveal reveal-delay-4";
		document.body.append(tarde);

		mutacion().fire();

		expect(observer().observed.has(tarde)).toBe(true);
		tarde.remove();
	});

	test("desconecta ambos observers al desmontar", () => {
		const { unmount } = render(<Probe />);
		const io = observer();
		const mutation = mutacion();
		unmount();

		expect(io.disconnected).toBe(true);
		expect(mutation.disconnected).toBe(true);
	});
});

describe("el reveal no se cablea en la raíz", () => {
	// Todo se ancla a `src/`, que es donde viven `routes/` y `components/`.
	const srcDir = new URL("../../", import.meta.url);
	const routesDir = new URL("routes/", srcDir);
	const raw = (name: string) => readFileSync(new URL(name, srcDir), "utf8");

	/**
	 * El codigo sin comentarios.
	 *
	 * Hace falta porque los comentarios que explican el bug nombran las cosas
	 * que el test prohibe: `__root.tsx` dice "el observer que escribe
	 * `data-revealed`", y un `not.toContain("data-revealed")` sobre el archivo
	 * entero fallaria con el archivo CORRECTO. Solo se borran comentarios de
	 * bloque y los que arrancan al principio de una linea, no los `//` que
	 * aparecen dentro de un string, que son URLs.
	 */
	const code = (name: string) =>
		raw(name)
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split("\n")
			.map((line) => (/^\s*\/\//.test(line) ? "" : line))
			.join("\n");

	/**
	 * `reveal` en minúscula y standalone: matchea `"reveal reveal-delay-2"` y
	 * `.reveal`, y NO matchea `useRevealOnScroll` — que es justamente el
	 * cableado que este test no quiere contar como "la ruta tiene reveal".
	 */
	const tieneReveal = (fuente: string) =>
		/(?<![\w-])reveal(?![\w-])/.test(fuente);

	/**
	 * Si el archivo RENDERIZA un `.reveal`, directo o por un componente.
	 *
	 * Directo no alcanza: la home —la ruta más importante— no tiene un solo
	 * `reveal` en `index.tsx`; sus `.reveal` viven en `<Hero>`, `<Features>`,
	 * `<Faq>`. Un chequeo por archivo marcaría a `index.tsx` como "no tiene
	 * reveal" y el guard no lo vigilaría, que es justo el peor agujero posible.
	 * Por eso se siguen los `import ... from "@/components/..."` hasta el tope.
	 */
	const renderizaReveal = (
		archivo: string,
		memo = new Map<string, boolean>(),
	): boolean => {
		const memoizado = memo.get(archivo);
		if (memoizado !== undefined) return memoizado;
		// Antes de recursionar, para cortar un ciclo de imports.
		memo.set(archivo, false);

		const fuente = code(archivo);
		let resultado = tieneReveal(fuente);
		for (const importado of fuente.matchAll(/from "@\/components\/([^"]+)"/g)) {
			const hijo = `components/${importado[1]}.tsx`;
			if (!existsSync(new URL(hijo, srcDir))) continue;
			if (renderizaReveal(hijo, memo)) {
				resultado = true;
				break;
			}
		}
		memo.set(archivo, resultado);
		return resultado;
	};

	test("`__root.tsx` no escribe `data-revealed`", () => {
		// El root route se hidrata antes que la ruta —no es lazy—, así que un
		// observer acá escribe en DOM que React todavía no es suyo. Medido:
		// la escritura caía 55 ms antes del reclamo y React reportaba el
		// mismatch 65 ms después.
		const raiz = code("routes/__root.tsx");
		expect(raiz).not.toContain("data-revealed");
		expect(raiz).not.toContain("dataset.revealed");
		expect(raiz).not.toContain("IntersectionObserver");
		expect(raiz).not.toContain("MutationObserver");
		// Lo que SÍ se queda: la clase que abre el estado oculto.
		expect(raiz).toContain('classList.add("js")');
	});

	test("`__root.tsx` no llama al hook, aunque no escriba el atributo", () => {
		// Esta aserción existe porque la anterior no alcanzó: mover la escritura
		// al hook y llamarlo desde la raíz deja `__root.tsx` sin una sola
		// mención de `data-revealed` y reproduce el bug igual, porque el effect
		// sigue corriendo en el commit de la envoltura. Se verificó revirtiendo
		// el fix con esta forma: la otra aserción pasaba en verde.
		expect(code("routes/__root.tsx")).not.toContain("useRevealOnScroll");
	});

	test("toda ruta con `.reveal` llama al hook, y solo ella", () => {
		// Adentro del test, no del `describe`: un path roto que revienta en la
		// colección deja a bun sin una sola línea de salida.
		const rutas = readdirSync(routesDir).filter(
			(f) => f.endsWith(".tsx") && f !== "__root.tsx",
		);
		const sinHook: string[] = [];
		const hookSinReveal: string[] = [];

		for (const ruta of rutas) {
			const fuente = code(`routes/${ruta}`);
			// El import es `useRevealOnScroll` sin paréntesis: buscar la llamada
			// con paréntesis ya distingue una de la otra.
			const llama = fuente.includes("useRevealOnScroll()");
			const conReveal = renderizaReveal(`routes/${ruta}`);
			if (conReveal && !llama) sinHook.push(ruta);
			if (!conReveal && llama) hookSinReveal.push(ruta);
		}

		// Una ruta nueva con `.reveal` y sin la línea se queda sin animación:
		// sin error y sin aviso. Este es el aviso.
		expect(sinHook).toEqual([]);
		// Y al revés: el hook en una ruta sin reveal no hace falta.
		expect(hookSinReveal).toEqual([]);
	});
});
