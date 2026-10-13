/**
 * El reveal-on-scroll de `.reveal`, como hook y NO en `__root.tsx`.
 *
 * ─── POR QUÉ NO VIVE EN LA RAÍZ (medido, no supuesto) ───────────────────────
 *
 * El síntoma era un `A tree hydrated but some attributes of the server
 * rendered HTML didn't match` cuyo diff.markup era siempre el mismo:
 *
 *     <p className="... reveal reveal-delay-2"
 *     -  data-revealed="true"
 *
 * O sea: React encontraba `data-revealed` en el DOM y no en sus props. Ese
 * atributo no lo renderiza nadie — lo escribe ESTE código, a mano, en el
 * callback del `IntersectionObserver`. La pregunta era entonces qué lo escribía
 * antes de tiempo, y la respuesta es: el efecto de la raíz.
 *
 * Las rutas de archivo van detrás de `lazyRouteComponent` (code-splitting
 * automático del plugin de TanStack), o sea un `<Lazy>` en el árbol. Medido en
 * el browser contra el dev server, todo en un mismo reloj:
 *
 *     t=2460 ms  router emite `onRendered`
 *     t=2466 ms  effect de la RAÍZ: se construye el IntersectionObserver
 *     t=2531 ms  el callback escribe `data-revealed`   <-- React NO es dueño
 *     t=2586 ms  React reclama ese DOM (`__reactFiber$` aparece)
 *     t=2596 ms  React reporta el mismatch
 *
 * O sea: React hidrata la ENVOLVENTA (el root route no es lazy, se hidrata
 * primero) y por eso su effect ya corrió; el subárbol de la ruta todavía no
 * estaba reclamado cuando el observer escribió. `onRendered` del router NO
 * sirve como señal: se emitió 126 ms ANTES del reclamo. Por eso el fix no es
 * "esperar a que hidrató" — no hay señal pública que lo diga — sino no escribir
 * en DOM ajeno: acá el effect corre DENTRO de la frontera lazy, después del
 * reclamo (medido: `claimedByReact: true`).
 *
 * ─── POR QUÉ `html.js` SE QUEDA EN LA RAÍZ ──────────────────────────────────
 *
 * Esa clase abre el estado oculto (`html.js .reveal { opacity: 0 }`). Se
 * escribe en el effect de la raíz, que corre cuando `<html>` ya está
 * reclamado —por eso nunca aparece en el diff— y tiene que seguir ahí: si
 * waits a la ruta, el hermético es "todo invisible sin observer". La clase se
 * pone temprano a propósito; la que escribe en los hijos es esta.
 *
 * ─── UNA LÍNEA POR RUTA, Y POR QUÉ ─────────────────────────────────────────
 *
 * `business-signup` no llama al hook y está bien: no tiene `.reveal`. La lista
 * de rutas que lo llaman es la lista de rutas con reveal, y una ruta nueva que
 * se olvide de la línea se queda sin animación — sin error, sin aviso. Es el
 * costo de no hacerlo en la raíz, y es el precio de no escribir en DOM que
 * React todavía no es suyo.
 */

import { useEffect } from "react";

/**
 * Registra los `.reveal` sin revelar y los marca al entrar en viewport.
 *
 * Un solo hook por ruta montada. En una navegación del cliente el observer
 * anterior se desconecta (cleanup) y el nuevo `observeAll()` finds todo lo que
 * hay en el documento, así que el `MutationObserver` solo hace falta para los
 * `.reveal` que aparecen DENTRO de una ruta ya montada (un acordeón que abre,
 * por ejemplo).
 */
export function useRevealOnScroll(): void {
	// react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- cleanup below disconnects both IntersectionObserver and MutationObserver
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLElement).dataset.revealed = "true";
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
		);

		const observeAll = () => {
			document
				.querySelectorAll(".reveal:not([data-revealed='true'])")
				.forEach((el) => {
					observer.observe(el);
				});
		};

		observeAll();

		const mutation = new MutationObserver(observeAll);
		mutation.observe(document.body, { childList: true, subtree: true });

		return () => {
			observer.disconnect();
			mutation.disconnect();
		};
	}, []);
}
