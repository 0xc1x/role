import { useEffect, useState } from "react";
import { countUpFrom } from "./stats-format";

const DURATION_MS = 1400;

/**
 * Cuánta fracción del camino ya se recorrió en `t` (0..1), con salida suave.
 *
 * `outQuad`, y no `outExpo`. MEDIDO sobre el rango real del sitio (`20 → 2`):
 * con `outExpo` el 95% del recorrido estaba a los 330 ms y el bloque, que está
 * en `opacity: 0` hasta los 400 ms por su `reveal-delay-4`, mostraba solo dos
 * valores — 19 y 20. Con `outQuad` se ven diez.
 *
 * `outExpo` daba un salto instantáneo-LIKE en rangos grandes y era ilegible en
 * los chicos: en un rango de 10 unidades no hay granularidad para una curva agresiva.
 */
function easeOutQuad(t: number): number {
	return t >= 1 ? 1 : 1 - (1 - t) ** 2;
}

/** `true` cuando el usuario pidió menos movimiento. Sin matchMedia, noAnimamos. */
function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cuenta de `countUpFrom(value)` a `value` y devuelve el valor interpolado.
 *
 * `undefined` es passthrough: la API no respondió y no hay nada que contar. El
 * `—` del hero lo pone `formatStat`, no este hook.
 *
 * ─── Por qué el estado inicial es el FINAL y no el arranque ──────────────────
 *
 * El servidor no tiene `requestAnimationFrame` ni sabe qué quiere el usuario, así
 * que solo puede pintar el valor final. Si el estado inicial fuera
 * `countUpFrom(value)`, el HTML servido diría "20+" y el primer render del
 * cliente diría "10+": hydration mismatch. React lo desarrolla con un error y en
 * producción lo parchea en silencio — los stats quedan en 10 y el visitante ve un
 * número que nunca fue el real.
 *
 * Por eso el conteo arranca en el `useEffect`: para entonces React ya hydrató
 * contra el mismo HTML que el crawler leyó.
 */
export function useCountUp(value: number | undefined): number | undefined {
	const [displayed, setDisplayed] = useState(value);

	useEffect(() => {
		if (value === undefined) {
			setDisplayed(undefined);
			return;
		}

		if (
			prefersReducedMotion() ||
			typeof requestAnimationFrame === "undefined"
		) {
			setDisplayed(value);
			return;
		}

		const from = countUpFrom(value);
		// Sin recorrido no hay nada que animar: evita un rAF que no mueve nada.
		if (from >= value) {
			setDisplayed(value);
			return;
		}

		let frame = 0;
		const started = performance.now();

		const step = (now: number) => {
			const t = Math.min(1, (now - started) / DURATION_MS);
			setDisplayed(Math.round(from + (value - from) * easeOutQuad(t)));
			if (t < 1) frame = requestAnimationFrame(step);
		};

		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [value]);

	return displayed;
}
