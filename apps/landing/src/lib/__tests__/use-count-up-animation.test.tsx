/**
 * ¿La animación CORRE, o solo el valor inicial está bien?
 *
 * El resto de los specs de este hook miran el primer render, que es exactamente
 * el estado en el que la animación todavía no empezó. Un hook que devuelve el
 * valor final y nunca anima pasaría todos esos tests — y en el browser no
 * contaría nada. Este archivo maneja el reloj: `requestAnimationFrame` y
 * `performance.now()` son los dos que deciden la interpolación, y con
 * `happy-dom` por defecto no avanzan solos.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import { countUpFrom } from "../stats-format";
import { useCountUp } from "../use-count-up";
import { cleanup, renderHook } from "../../test-utils/dom";
import { setReducedMotion, stubMatchMedia } from "../../test-utils/motion";

type FrameCallback = (now: number) => void;

/** Cuántos frames se pidieron desde el último `reset`. */
let framesRequested = 0;

let now = 0;
const pending = new Map<number, FrameCallback>();
let nextId = 1;

beforeEach(() => {
	// El reloj falso vive para toda la suite y NUNCA se restaura a `undefined`:
	// el `cleanup()` de testing-library cancela frames al desmontar, y dejar
	// `cancelAnimationFrame` en undefined revienta con un error que no tiene
	// nada que ver con lo que se está probando.
	const g = globalThis as Record<string, unknown>;
	g.requestAnimationFrame = ((cb: FrameCallback) => {
		framesRequested++;
		const id = nextId++;
		pending.set(id, cb);
		return id;
	}) as typeof requestAnimationFrame;
	g.cancelAnimationFrame = ((id: number) => {
		pending.delete(id);
	}) as typeof cancelAnimationFrame;
	performance.now = () => now;
	stubMatchMedia();
	setReducedMotion(false);
	framesRequested = 0;
	now = 0;
	nextId = 1;
	pending.clear();
});

afterEach(() => cleanup());

/**
 * Corre los frames pendientes con el reloj en `ms`.
 *
 * DENTRO de `act()`, y no por prolijidad: `setDisplayed` dispara un re-render
 * de React, y una actualización de estado fuera de `act` no se flushea antes de
 * que termine el test. Sin el envoltorio, `result.current` devuelve el valor
 * viejo y las aserciones siguientes pasan por vacuidad — un `expect(x).toBe(20)`
 * al final "acierta" porque nunca volvió a leer el estado.
 */
function advance(ms: number) {
	now = ms;
	const callbacks = [...pending.values()];
	pending.clear();
	act(() => {
		for (const cb of callbacks) cb(now);
	});
}

describe("useCountUp se VE, no solo corre", () => {
	// El test que faltaba y que motivó todo esto. Los specs de arriba
	// verificaban que el `requestAnimationFrame` se pidiera y que el valor
	// llegara al final: eso lo pasa igual una animación que en la práctica no
	// muestra nada. Lo que importa es cuántos VALORES DISTINTOS ve un humano.
	//
	// Y hay que contar desde los 400ms, no desde el 0: el bloque de stats tiene
	// `reveal-delay-4`, así que está en `opacity: 0` durante los primeros 400ms
	// (`styles.css:262` y `:356`). Ese medio segundo no cuenta — se lo pierde
	// quien está mirando.
	test("el número se ve empezar bajo, no aparecer ya casi terminado", () => {
		const { result } = renderHook(() => useCountUp(20));

		const vistos = new Set<number>();
		for (let t = 0; t <= 2000; t += 16) {
			advance(t);
			if (t >= 400 && result.current !== undefined) vistos.add(result.current);
		}

		// EL ASSERTION QUE ATRAPA EL BUG. No "cuántos valores se ven" —eso es un
		// número que se negocia— sino "el primer valor visible está
		// claramente por debajo del final". Con la curva anterior (`outExpo`)
		// el primer valor visible era 19 sobre un final de 20: 0.95, y eso es un
		// parpadeo por más tests que affirmen que la animación corría.
		const primero = Math.min(...vistos);
		expect(primero).toBeLessThanOrEqual(20 * 0.8);

		// Y que haya recorrido, no saltado: menos de cinco valores distintos es
		// un cambio de estado, no un conteo.
		expect(vistos.size).toBeGreaterThanOrEqual(5);
		expect(result.current).toBe(20);
	});

	test("también con miles se ve una progresión, no un salto", () => {
		const { result } = renderHook(() => useCountUp(18847));
		const vistos = new Set<number>();
		for (let t = 0; t <= 2000; t += 16) {
			advance(t);
			if (t >= 400 && result.current !== undefined) vistos.add(result.current);
		}
		// Con 99 unidades de recorrido la progresión es holgada; el piso es que
		// exista, no una cantidad concreta.
		expect(vistos.size).toBeGreaterThanOrEqual(10);
		expect(result.current).toBe(18847);
	});
});

describe("useCountUp anima de verdad", () => {
	test("el valor parte del arranque, progresa y aterriza exacto", () => {
		const { result } = renderHook(() => useCountUp(20));

		// El primer render es el que ve el crawler: el final, no el arranque.
		// `renderHook` flushea los efectos, así que el frame YA está pedido acá —
		// lo que no ha pasado todavía es el primer `advance`, que es lo que
		// realmente mueve el número. Por eso no se asserta `framesRequested === 0`.
		expect(result.current).toBe(20);

		// El primer frame ya arranca en el valor de `countUpFrom`: sube, pero
		// no desde cero.
		advance(0);
		expect(result.current).toBe(countUpFrom(20));
		expect(result.current).toBeLessThan(20);

		advance(300);
		expect(result.current ?? 0).toBeGreaterThan(countUpFrom(20));

		advance(1200);
		expect(result.current).toBe(20);
	});

	test("nunca excede el final en ningún frame y no empieza en cero", () => {
		const { result } = renderHook(() => useCountUp(18847));

		advance(0);
		// El requisito: con miles no se cuenta desde 0.
		expect(result.current).toBeGreaterThan(18000);

		// El reloj tiene que CORRER MÁS ALLÁ de la duración, o el último frame
		// nunca se evalúa y el número se queda a uno del final.
		for (let t = 50; t <= 1600; t += 50) {
			advance(t);
			expect(result.current).toBeLessThanOrEqual(18847);
		}
		expect(result.current).toBe(18847);
	});

	test("con movimiento reducido no pide ni un solo frame", () => {
		setReducedMotion(true);
		const { result } = renderHook(() => useCountUp(1847));

		expect(result.current).toBe(1847);
		advance(600);
		expect(framesRequested).toBe(0);
	});

	test("sin dato no pide frames tampoco", () => {
		const { result } = renderHook(() => useCountUp(undefined));
		advance(600);
		expect(result.current).toBeUndefined();
		expect(framesRequested).toBe(0);
	});
});
