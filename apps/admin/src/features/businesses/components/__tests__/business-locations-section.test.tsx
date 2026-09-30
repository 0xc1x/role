import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { BusinessLocationDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessLocationsSection } from "../business-locations-section";

const previousFetch = globalThis.fetch;

const businessId = "11111111-1111-4111-8111-111111111111";
const businessName = "Café Central";
const locationId = "22222222-2222-4222-8222-222222222222";

const location: BusinessLocationDto = {
	id: locationId,
	business_id: businessId,
	name: "Sucursal del centro",
	address: "Av. principal 123",
	phone: "+593 99 123 4567",
	latitude: -0.1807,
	longitude: -78.4678,
	is_active: true,
	zone: "Centro",
	is_headquarter: true,
	created_at: "2026-09-01T10:00:00.000Z",
	updated_at: "2026-09-01T10:00:00.000Z",
};

function paginated(rows: BusinessLocationDto[]) {
	return {
		data: rows,
		meta: { page: 1, limit: 100, total: rows.length, total_pages: 1 },
	};
}

interface RecordedRequest {
	url: string;
	method: string;
}

/**
 * Las rutas se separan por método: la lista (GET) tiene que responder 200 para
 * que la fila exista en pantalla, y el `DELETE` es el que se quiere hacer fallar.
 * Un stub único escondería justo el botón que el test necesita pulsar.
 */
function stubFetch(
	options: {
		list?: { status?: number; body: unknown };
		remove?: { status?: number; body?: unknown; raw?: boolean };
	} = {},
) {
	const calls: RecordedRequest[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		calls.push({ url: String(input), method });
		if (method === "GET") {
			const list = options.list ?? { body: paginated([]) };
			return new Response(JSON.stringify(list.body), {
				status: list.status ?? 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		const remove = options.remove ?? { status: 200, body: undefined };
		if (remove.raw) return new Response("", { status: remove.status ?? 200 });
		return new Response(JSON.stringify(remove.body ?? null), {
			status: remove.status ?? 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
}

function renderSection(enabled = true) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<BusinessLocationsSection
				businessId={businessId}
				businessName={businessName}
				enabled={enabled}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("puntos de retiro en la ficha del negocio", () => {
	test("lista los puntos de retiro con su dirección y coordenadas", async () => {
		stubFetch({ list: { body: paginated([location]) } });
		renderSection();

		await waitFor(() =>
			expect(screen.getByText("Sucursal del centro")).toBeDefined(),
		);
		expect(screen.getByText("Av. principal 123")).toBeDefined();
		// El contrato los entrega como `z.number()`: se muestran como el par que
		// se envió, no como un campo de texto crudo.
		expect(screen.getByText("-0.1807, -78.4678")).toBeDefined();
		expect(screen.getByText("Centro")).toBeDefined();
		expect(screen.getByText("Sede")).toBeDefined();
		expect(screen.getByText("Activo")).toBeDefined();
	});

	// El `DELETE` de la API desactiva en vez de borrar. Mostrar solo las activas
	// haría creer al operador que el punto desapareció y le quitaría el único
	// camino para reactivarlo.
	test("un punto dado de baja sigue visible, marcado como inactivo", async () => {
		stubFetch({
			list: { body: paginated([{ ...location, is_active: false }]) },
		});
		renderSection();

		await waitFor(() => expect(screen.getByText("Inactivo")).toBeDefined());
		expect(screen.getByText("Sucursal del centro")).toBeDefined();
	});

	test("dice que no hay puntos de retiro nombrando al negocio", async () => {
		stubFetch({ list: { body: paginated([]) } });
		renderSection();

		await waitFor(() =>
			expect(
				screen.getByText(
					`Sin puntos de retiro registrados para ${businessName}.`,
				),
			).toBeDefined(),
		);
	});

	test("no consulta con el drawer cerrado", () => {
		const calls = stubFetch({ list: { body: paginated([location]) } });
		renderSection(false);

		expect(calls).toHaveLength(0);
	});

	// El riesgo real de esta pantalla es dar de baja el punto equivocado sin
	// tener delante el negocio al que pertenece.
	test("la confirmación nombra el negocio y el punto de retiro", async () => {
		stubFetch({ list: { body: paginated([location]) } });
		renderSection();

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Eliminar punto de retiro Sucursal del centro",
			}),
		);

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Dar de baja el punto de retiro?");
		expect(dialog.textContent).toContain("Sucursal del centro");
		expect(dialog.textContent).toContain("Av. principal 123");
		expect(dialog.textContent).toContain(businessName);
		// El verbo dice lo que la API hace: desactiva, no borra.
		expect(dialog.textContent).toContain(
			"dejará de aparecer para los clientes",
		);
	});

	test("dar de baja llama al DELETE de la ubicación y refresca la lista", async () => {
		const calls = stubFetch({
			list: { body: paginated([location]) },
			remove: { status: 200, raw: true },
		});
		renderSection();

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Eliminar punto de retiro Sucursal del centro",
			}),
		);
		fireEvent.click(await screen.findByRole("button", { name: "Dar de baja" }));

		await waitFor(() =>
			expect(calls.some((call) => call.method === "DELETE")).toBe(true),
		);
		const del = calls.find((call) => call.method === "DELETE");
		expect(del?.url).toContain(
			`/businesses/${businessId}/locations/${locationId}`,
		);
	});

	test("un fallo al dar de baja avisa con el requestId de la API", async () => {
		stubFetch({
			list: { body: paginated([location]) },
			remove: {
				status: 409,
				body: {
					statusCode: 409,
					message: "Conflict",
					requestId: "req-del-loc-01",
				},
			},
		});
		const error = spyOn(toast, "error");
		renderSection();

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Eliminar punto de retiro Sucursal del centro",
			}),
		);
		fireEvent.click(await screen.findByRole("button", { name: "Dar de baja" }));

		// Sin el `requestId` el operador no puede cruzar el fallo con el log.
		await waitFor(() =>
			expect(error).toHaveBeenCalledWith(
				"Conflicto con el estado actual · req-del-loc-01",
			),
		);
		// El diálogo sigue abierto: el cambio no se aplicó.
		expect(await screen.findByRole("alertdialog")).toBeDefined();
	});

	test("un punto ya dado de baja no ofrece volver a darlo de baja", async () => {
		stubFetch({
			list: { body: paginated([{ ...location, is_active: false }]) },
		});
		renderSection();

		await waitFor(() => expect(screen.getByText("Inactivo")).toBeDefined());
		const button = screen.getByRole("button", {
			name: "Eliminar punto de retiro Sucursal del centro",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});
});
