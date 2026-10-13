/**
 * ─── Por qué este archivo existe ──────────────────────────────────────────────
 *
 * Fija el bug del parpadeo y de la animación perdida en el primer render.
 *
 * MEDIDO en navegador real (no deducido), contra la landing servida por el dev
 * server con React 19:
 *
 *     t=   0ms  source=api      opacity=1     [20+ | 14+ | 8+]  ← lo que pintó el server
 *     t=1320ms  opacity=0.659   [20+ | 14+ | 8+]
 *     t=1560ms  source=loading  opacity=0     [— | — | —]     ← primer render del cliente
 *     PAGEERROR Hydration failed because the server rendered text didn't match
 *
 * La caché de React Query arranca VACÍA en el cliente —el SSR no deshidrata su
 * estado en el payload, verificado en `e2e/fixtures.ts`—, así que el primer
 * render del navegador ve `data === undefined`, `formatStat(undefined)` devuelve
 * `"—"` y React compara ese `"—"` contra el `20+` que el server puso en el HTML.
 * Descarta el subárbol del Hero y lo regenera. De ahí salen los dos síntomas:
 *
 *  1. El parpadeo: las cifras caen a `"—"` y vuelven.
 *  2. La animación que no se ve: `useCountUp` monta con el valor final ya
 *     presente, `countUpFrom(20) === 10 < 20` no se cumple y sale por la rama
 *     de `setDisplayed(value)` sin animar nunca (`use-count-up.ts:64-67`).
 *
 * El aviso de la navbar tenía el mismo problema y ya lo resolvió con el patrón
 * "mientras el observer no tenga respuesta, contesta el loader"
 * (`use-announcements.ts`). Este archivo exige el MISMO contrato para las stats,
 * que es lo que `use-config.ts` tenía pendiente —su propio comentario lo dice.
 *
 * POR QUÉ ESTE TEST Y NO `hero-stats-source.test.tsx`: aquel renderiza el Hero
 * SIN servidor, con la caché vacía desde el principio. Su primer render es
 * `loading` y el siguiente `api`, y eso está bien: no hay HTML previo con el que
 * discrepar. El desajuste solo existe cuando un render de servidor pinta algo y
 * el cliente pinta OTRA cosa, así que el caso necesita los dos lados.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePlatformStats, type PlatformStatsResult } from "@/lib/use-config";
import { cleanup, render } from "@/test-utils/dom";

const SERVED: PlatformStatsResult = {
	data: { users: 20, businesses: 14, meals_saved: 8 },
	source: "api",
};

/** Caché VACÍA: es exactamente lo que hay en el navegador tras hidratar. */
function emptyClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false, enabled: false } },
	});
}

/**
 * El markup del hero, alimentado por `usePlatformStats` CON el resultado del
 * loader — la firma que este test exige y que hoy no existe. TypeScript falla
 * aquí mientras el hook no la tenga, que es el RED de este ciclo.
 */
function FirstPaint({ delServidor }: { delServidor: PlatformStatsResult }) {
	const stats = usePlatformStats(delServidor);
	return (
		<dl data-stats-source={stats.source} data-testid="stats">
			<p aria-hidden="true">{formatStat(stats.data?.users)}</p>
			<p aria-hidden="true">{formatStat(stats.data?.businesses)}</p>
			<p aria-hidden="true">{formatStat(stats.data?.meals_saved)}</p>
		</dl>
	);
}

function formatStat(value: number | undefined): string {
	if (value === undefined) return "—";
	return `${new Intl.NumberFormat("es-EC").format(value)}+`;
}

function mount(delServidor: PlatformStatsResult) {
	return render(
		<QueryClientProvider client={emptyClient()}>
			<FirstPaint delServidor={delServidor} />
		</QueryClientProvider>,
	);
}

describe("primer render del cliente: la cifra del servidor no parpadea", () => {
	beforeEach(() => window.localStorage.clear());
	afterEach(() => cleanup());

	test("con el loader en 'api', el primer render trae las cifras y NO un '—'", () => {
		// El contrato que rompe el bug: el primer render del cliente tiene que
		// ser idéntico al HTML servido. Antes devolvía `—` y React regeneraba
		// el subárbol entero.
		const { getByTestId } = mount(SERVED);
		const block = getByTestId("stats");

		expect(block.textContent).toBe("20+14+8+");
		expect(block.textContent).not.toContain("—");
		expect(block.getAttribute("data-stats-source")).toBe("api");
	});

	test("la caché vacía del cliente no pisa la cifra que ya resolvió el loader", () => {
		// El caso discriminante: la query no puede devolver nada (enabled:
		// false), así que el único origen posible de la cifra es el loader.
		const { getByTestId } = mount(SERVED);

		expect(getByTestId("stats").textContent).toContain("20");
	});

	test("con la API caída, degrada a 'failed' y nunca a un 0 falso", () => {
		const { getByTestId } = mount({ data: undefined, source: "failed" });
		const block = getByTestId("stats");

		expect(block.getAttribute("data-stats-source")).toBe("failed");
		expect(block.textContent).toBe("———");
		expect(block.textContent).not.toContain("0");
	});
});