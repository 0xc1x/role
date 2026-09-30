import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@/test-utils/dom";
import { businessesKeys } from "../businesses.keys";
import {
	useBusinessLocations,
	useCreateBusinessLocation,
	useDeleteBusinessLocation,
	useUpdateBusinessLocation,
} from "../businesses.queries";

const previousFetch = globalThis.fetch;

const businessId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";

const location = {
	id: locationId,
	business_id: businessId,
	name: "Sucursal del centro",
	address: "Av. principal 123",
	phone: "+593 99 000 0000",
	latitude: -0.1807,
	longitude: -78.4678,
	is_active: true,
	zone: "Centro",
	is_headquarter: true,
	created_at: "2026-09-01T10:00:00.000Z",
	updated_at: "2026-09-01T10:00:00.000Z",
};

const paginated = {
	data: [location],
	meta: { page: 1, limit: 100, total: 1, total_pages: 1 },
};

function setup<T>(hook: () => T, options: { seed?: boolean } = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	// Lista sembrada: sin observador activo, invalidar no dispara refetch. Y con
	// `staleTime` de 30s, una lista sembrada además impide que la query dispare
	// su `fetch`: por eso los tests de lectura la piden sin sembrar.
	if (options.seed !== false) {
		queryClient.setQueryData(businessesKeys.locations(businessId), paginated);
	}
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return { queryClient, ...renderHook(hook, { wrapper }) };
}

interface RecordedRequest {
	url: string;
	method: string;
	body: unknown;
}

function stubFetch(status: number, body: unknown) {
	const calls: RecordedRequest[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? "GET",
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("ubicaciones del negocio — capa de datos", () => {
	test("lista contra la ruta hija del negocio, no contra un recurso top-level", async () => {
		const calls = stubFetch(200, paginated);
		const { result } = setup(() => useBusinessLocations(businessId), {
			seed: false,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		// El `businessId` viaja en el path: es lo que hace que la ubicación no
		// pueda colgarse de otro negocio por accidente desde el panel.
		expect(calls[0]?.url).toContain(`/businesses/${businessId}/locations`);
		expect(calls[0]?.url).toContain("page=1");
		expect(calls[0]?.url).toContain("limit=100");
		expect(result.current.data?.data).toHaveLength(1);
	});

	test("no consulta sin negocio (drawer cerrado)", () => {
		const calls = stubFetch(200, paginated);
		const { result } = setup(() => useBusinessLocations(null));

		expect(result.current.fetchStatus).toBe("idle");
		expect(calls).toHaveLength(0);
	});

	// Escribir un punto de retiro no puede invalidar `businessesKeys.lists()`: la
	// lista de negocios tiene `staleTime` y el operador no está mirándola.
	test("crear invalida solo las ubicaciones del negocio", async () => {
		stubFetch(201, location);
		const { queryClient, result } = setup(() =>
			useCreateBusinessLocation(businessId),
		);

		await result.current.mutateAsync({
			business_id: businessId,
			name: "Sucursal del centro",
			address: "Av. principal 123",
			latitude: -0.1807,
			longitude: -78.4678,
		});

		expect(
			queryClient.getQueryState(businessesKeys.locations(businessId))
				?.isInvalidated,
		).toBe(true);
	});

	test("editar envía el PATCH a la ubicación y refresca la ficha", async () => {
		const calls = stubFetch(200, { ...location, name: "Sucursal norte" });
		const { queryClient, result } = setup(() =>
			useUpdateBusinessLocation(businessId),
		);

		await result.current.mutateAsync({
			locationId,
			body: { name: "Sucursal norte" },
		});

		const call = calls[0];
		expect(call?.method).toBe("PATCH");
		expect(call?.url).toContain(
			`/businesses/${businessId}/locations/${locationId}`,
		);
		expect(call?.body).toEqual({ name: "Sucursal norte" });
		expect(
			queryClient.getQueryState(businessesKeys.locations(businessId))
				?.isInvalidated,
		).toBe(true);
	});

	// El `DELETE` responde sin cuerpo: un cliente que espera un DTO fallaría
	// DESPUÉS de haber aplicado el cambio.
	test("eliminar tolera la respuesta vacía y refresca la ficha", async () => {
		globalThis.fetch = (async () =>
			new Response("", { status: 200 })) as unknown as typeof fetch;
		const { queryClient, result } = setup(() =>
			useDeleteBusinessLocation(businessId),
		);

		await result.current.mutateAsync(locationId);

		expect(
			queryClient.getQueryState(businessesKeys.locations(businessId))
				?.isInvalidated,
		).toBe(true);
	});
});
