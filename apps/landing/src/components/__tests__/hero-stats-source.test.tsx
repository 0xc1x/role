import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { OfferWithBusiness } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@/test-utils/dom";

// El hero publica cifras de plataforma. Con la API caída la degradación es
// correcta (la landing no puede caerse), pero sin `data-stats-source` el "—"
// servido es indistinguible de un dato real y el fallo queda sin auditar.

mock.module("@tanstack/react-router", () => ({
	Link: (props: { children?: React.ReactNode; to?: string }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

import { Hero } from "../hero";

const previousFetch = globalThis.fetch;

function setup(
	stats: { status: number; body: unknown },
	offerDelServidor?: OfferWithBusiness | null,
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	globalThis.localStorage = window.localStorage;
	globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	globalThis.fetch = (async (input: unknown) => {
		const url = String(input);
		if (url.includes("/stats/platform")) {
			return new Response(JSON.stringify(stats.body), {
				status: stats.status,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("[]", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;

	return render(
		<QueryClientProvider client={queryClient}>
			<Hero offerDelServidor={offerDelServidor} />
		</QueryClientProvider>,
	);
}

function statsBlock(container: HTMLElement): HTMLElement | null {
	return container.querySelector("[data-stats-source]");
}

describe("procedencia de las stats del hero", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = previousFetch;
	});

	test("la API real se marca como 'api' y muestra las cifras", async () => {
		const { container } = setup({
			status: 200,
			body: { users: 10, businesses: 2, meals_saved: 5 },
		});

		await waitFor(() =>
			expect(statsBlock(container)?.getAttribute("data-stats-source")).toBe(
				"api",
			),
		);
		expect(container.textContent).toContain("10");
	});

	test("una API caída se marca como 'failed' y no finge un cero", async () => {
		const { container } = setup({ status: 503, body: { message: "caído" } });

		await waitFor(() =>
			expect(statsBlock(container)?.getAttribute("data-stats-source")).toBe(
				"failed",
			),
		);
		// El placeholder "—" no es un número: nunca debe publicar un 0 falso.
		expect(container.textContent).not.toContain("0+");
	});

	test("una petición en curso se marca como 'loading', no como 'failed'", () => {
		// Sin el tercer estado, un render inicial sano con la API lenta se
		// reportaba como degradación y no se podía auditar de verdad.
		const { container } = setup({ status: 200, body: { users: 10 } });

		expect(statsBlock(container)?.getAttribute("data-stats-source")).toBe(
			"loading",
		);
		expect(container.textContent).not.toContain("0+");
	});

	test("la oferta resuelta por SSR está en el primer render del cliente", () => {
		const offer = {
			id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
			business_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
			business_location_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
			title: "Algo Nuevo",
			description: null,
			image: "https://cdn.example.test/algo-nuevo.jpg",
			category_ids: [],
			original_price: 10,
			discounted_price: 5,
			discount_percentage: 50,
			stock: 3,
			initial_stock: 3,
			pickup_start: "2026-01-01T12:00:00.000Z",
			pickup_end: "2026-01-01T18:00:00.000Z",
			is_active: true,
			includes: null,
			allergens: null,
			rating: 0,
			review_count: 0,
			created_at: "2026-01-01T12:00:00.000Z",
			updated_at: "2026-01-01T12:00:00.000Z",
			categories: [],
			business: {
				id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
				name: "Panadería Central",
				slug: "panaderia-central",
				image: null,
				rating: 4.5,
			},
			location: {
				id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
				name: "Matriz",
				address: "Calle 123",
				latitude: -33.45,
				longitude: -70.66,
				zone: null,
			},
			distance_km: null,
		} satisfies OfferWithBusiness;

		const { container } = setup(
			{ status: 200, body: { users: 10, businesses: 2, meals_saved: 5 } },
			offer,
		);

		const image = container.querySelector<HTMLImageElement>("img");
		expect(image?.getAttribute("src")).toBe(offer.image);
		expect(container.textContent).toContain("Algo Nuevo");
	});
});
