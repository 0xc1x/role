/**
 * El hero publicaba un `-70%` que el producto nunca Having affirmed.
 *
 * MEDIDO con la respuesta real de `/offers/random` (200, cuerpo correcto) en el
 * navegador: `titulo pintado: "Comercios locales"` —el fallback, no la oferta— y
 * `badges: ["-70%"]`.
 *
 * La oferta no llegaba al componente porque su parseo falla: los UUID de semilla
 * `e0000000-0000-…` llevan `0` donde RFC 4122 exige `[89ab]`, y Postgres los
 * acepta como `uuid` porque su cast es más permisivo. Con los valores fijos del
 * hero, `Math.round((1 - 36 / 120) * 100)` da 70 — y `DISCOUNT_MAX_PERCENT` es
 * 55. No era un claim de marketing: era un número calculado a la vista de todo
 * visitante, a partir de datos que no existen.
 *
 * La regla ya estaba escrita en `stats-format.ts`: "`undefined` NO es `0`". Un
 * descuento es una promesa sobre un producto concreto; sin oferta no hay nada
 * que prometer, así que no se pinta.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@/test-utils/dom";

mock.module("@tanstack/react-router", () => ({
	Link: (props: { children?: React.ReactNode; to?: string }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

import { Hero } from "../hero";

const previousFetch = globalThis.fetch;

const OFERTA_REAL = {
	id: "e0000000-0000-0000-0000-000000000105",
	business_id: "d0000000-0000-0000-0000-000000000012",
	business_location_id: "54e6b308-7134-4a5a-bf97-5090f22872f2",
	title: "Cheesecake de maracuyá",
	description: "Porción de cheesecake con maracuyá de la zona.",
	image: null,
	category_ids: ["54dfc94b-1e3d-4f2c-bed2-94770cdb7c8e"],
	categories: [
		{ id: "54dfc94b-1e3d-4f2c-bed2-94770cdb7c8e", name: "Café", slug: "cafe" },
	],
	original_price: 4,
	discounted_price: 2,
	discount_percentage: 50,
	stock: 3,
	initial_stock: 5,
	pickup_start: "2026-05-28T06:00:00.000Z",
	pickup_end: "2026-12-31T22:00:00.000Z",
	is_active: true,
	includes: null,
	allergens: null,
	rating: 0,
	review_count: 0,
	created_at: "2026-05-19T13:29:05.393Z",
	updated_at: "2026-07-31T04:46:04.205Z",
	distance_km: null,
	business: {
		id: "d0000000-0000-0000-0000-000000000012",
		name: "Café del Valle",
		slug: "cafe-del-valle-santo-domingo",
		image: null,
		rating: 0,
	},
	location: {
		id: "54e6b308-7134-4a5a-bf97-5090f22872f2",
		name: "Matriz",
		address: "Centro Comercial del Valle, Santo Domingo",
		latitude: -0.2545,
		longitude: -79.168,
		zone: "Santo Domingo de los Tsachilas",
	},
};

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function setup() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	globalThis.localStorage = window.localStorage;
	globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

	const fakeFetch = async (input: unknown) => {
		const url = String(input);
		if (url.includes("/stats/platform")) {
			return jsonResponse({ users: 20, businesses: 14, meals_saved: 8 });
		}
		if (url.includes("/offers/random")) {
			return jsonResponse(OFERTA_REAL);
		}
		return jsonResponse([]);
	};
	// El cast va en la asignación, no en la flecha: dentro de un `.tsx` el
	// parser confundía el cierre de la firma con el JSX de abajo.
	globalThis.fetch = fakeFetch as unknown as typeof globalThis.fetch;

	return render(
		<QueryClientProvider client={queryClient}>
			<Hero />
		</QueryClientProvider>,
	);
}

describe("el descuento del hero", () => {
	beforeEach(() => window.localStorage.clear());

	afterEach(() => {
		cleanup();
		globalThis.fetch = previousFetch;
	});

	test("sin oferta usable no inventa un porcentaje de descuento", () => {
		// RED de este ciclo: con el fallo de parseo el hero usaba 120/36 y
		// pintaba -70%, un número que contradice DISCOUNT_MAX_PERCENT (55).
		const { container } = setup();

		expect(container.textContent).not.toContain("-70%");
		expect(container.textContent).not.toContain("70%");
	});

	test("la tarjeta conserva su estructura: el fix no rompe el layout", () => {
		const { container } = setup();

		expect(container.querySelector("[data-hero]")).not.toBeNull();
	});
});
