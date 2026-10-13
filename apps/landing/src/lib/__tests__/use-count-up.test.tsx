/**
 * El hook del conteo, y las dos reglas que lo hacen seguro.
 *
 * LA REGLA DE HIDRATACIÓN. El SSR pinta el valor FINAL y el primer render del
 * cliente tiene que pintar exactamente lo mismo; recién después, en un efecto,
 * arranca el conteo. Si el hook empezara en `countUpFrom(valor)` desde el
 * `useState` inicial, el HTML del servidor diría "20+" y el primer render del
 * cliente diría "10+": hydration mismatch, y React tira la página en desarrollo
 * mientras en producción parchea el DOM y deja los stats en 10 para siempre.
 *
 * LA REGLA DE MOVIMIENTO REDUCIDO. `prefers-reduced-motion` no es un detalle:
 * el repo ya lo respeta en `styles.css` para las animaciones CSS, pero un conteo
 * que corre en `requestAnimationFrame` no lo agarra ninguna media query. Este
 * test es el que lo cubre, porque la alternativa —un número que sube 60 veces por
 * segundo— es justo lo que esa preferencia existe para evitar.
 */
import { describe, expect, test } from "bun:test";
import { useCountUp } from "../use-count-up";
// El wrapper del repo, no `@testing-library/react` directo: este es el que
// registra happy-dom. Importar el de arriba deja `document` sin definir y el
// fallo dice "document is not defined" en lugar de decir qué se rompió.
import { cleanup, renderHook } from "../../test-utils/dom";
import {
	setReducedMotion,
	stubMatchMedia,
	teardownMotion,
} from "../../test-utils/motion";

describe("useCountUp con movimiento reducido", () => {
	test("devuelve el valor final desde el primer render y no pide frames", () => {
		// El conteo de frames es lo que DISCRIMINA este test. Sin él, la
		// aserción de arriba pasaría igual con la animación encendida, porque el
		// estado inicial del hook es el valor final en los dos casos — el
		// primer render no puede distinguir una cosa de la otra.
		const restore = stubMatchMedia();
		setReducedMotion(true);
		const before = globalThis.requestAnimationFrame;
		let frames = 0;
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			frames++;
			return before(cb);
		}) as typeof requestAnimationFrame;
		try {
			const { result } = renderHook(() => useCountUp(18847));
			expect(result.current).toBe(18847);
			expect(frames).toBe(0);
		} finally {
			globalThis.requestAnimationFrame = before;
			teardownMotion();
			restore();
		}
	});

	test("también con 0 y con un valor chico, no alarga nada", () => {
		const restore = stubMatchMedia();
		setReducedMotion(true);
		try {
			expect(renderHook(() => useCountUp(0)).result.current).toBe(0);
			expect(renderHook(() => useCountUp(8)).result.current).toBe(8);
		} finally {
			teardownMotion();
			restore();
		}
	});
});

describe("useCountUp sin movimiento reducido", () => {
	test("el PRIMER render ya devuelve el valor final, para no romper la hidratación", () => {
		// El orden importa más que el valor: lo que se mira es que el primer
		// render coincida con lo que el servidor pudo haber pintado, y eso solo
		// se garantiza si el estado inicial es el final.
		const restore = stubMatchMedia();
		setReducedMotion(false);
		try {
			const { result } = renderHook(() => useCountUp(20));
			expect(result.current).toBe(20);
		} finally {
			teardownMotion();
			restore();
		}
	});

	test("con un valor undefined no cuenta y no rompe", () => {
		const restore = stubMatchMedia();
		setReducedMotion(false);
		try {
			const { result } = renderHook(() => useCountUp(undefined));
			expect(result.current).toBeUndefined();
		} finally {
			teardownMotion();
			restore();
		}
	});

	test("si el valor cambia, arranca un conteo nuevo", () => {
		const restore = stubMatchMedia();
		setReducedMotion(false);
		try {
			const { result, rerender } = renderHook(
				({ value }: { value: number | undefined }) => useCountUp(value),
				{ initialProps: { value: 20 as number | undefined } },
			);
			expect(result.current).toBe(20);
			rerender({ value: 45 });
			expect(result.current).toBe(45);
		} finally {
			teardownMotion();
			restore();
			cleanup();
		}
	});
});
