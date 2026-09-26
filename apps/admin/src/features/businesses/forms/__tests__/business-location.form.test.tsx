import { afterEach, describe, expect, test } from "bun:test";
import type { BusinessLocationDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessLocationForm } from "../business-location.form";

const previousFetch = globalThis.fetch;

const businessId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const businessName = "Café Central";

const existing: BusinessLocationDto = {
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

interface RecordedRequest {
	url: string;
	method: string;
	body: Record<string, unknown> | undefined;
}

function stubFetch(
	status: number,
	body: unknown,
	raw = false,
): { calls: RecordedRequest[] } {
	const calls: RecordedRequest[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? "GET",
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		if (raw) return new Response("", { status });
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return { calls };
}

function renderForm(location?: BusinessLocationDto, onSuccess?: () => void) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const formId = location
		? `business-location-edit-${location.id}`
		: `business-location-create-${businessId}`;
	render(
		<QueryClientProvider client={queryClient}>
			<BusinessLocationForm
				formId={formId}
				businessId={businessId}
				businessName={businessName}
				{...(location ? { location } : {})}
				{...(onSuccess ? { onSuccess } : {})}
			/>
			<button type="submit" form={formId}>
				Enviar
			</button>
		</QueryClientProvider>,
	);
	return { formId, queryClient };
}

/** El form se envía con un `<button form=...>` externo, como los drawers reales. */
function submit() {
	fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("form de punto de retiro — alta", () => {
	test("exige nombre, dirección y coordenadas antes de pedir nada al servidor", async () => {
		const { calls } = stubFetch(201, existing);
		renderForm();

		submit();

		await waitFor(() =>
			expect(
				screen.getByText("Ingresa el nombre del punto de retiro"),
			).toBeDefined(),
		);
		expect(calls).toHaveLength(0);
	});

	// El contrato pide `z.number()` y el input es texto: si el form enviara el
	// string, la API respondería 422 y el operador vería el fallo en el servidor.
	test("convierte las coordenadas a número y manda business_id en el alta", async () => {
		const { calls } = stubFetch(201, existing);
		renderForm();

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		fireEvent.change(screen.getByLabelText("Dirección"), {
			target: { value: "Av. norte 456" },
		});
		fireEvent.change(screen.getByLabelText("Latitud"), {
			target: { value: "-0.1807" },
		});
		fireEvent.change(screen.getByLabelText("Longitud"), {
			target: { value: "-78.4678" },
		});
		submit();

		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(`/businesses/${businessId}/locations`);
		expect(calls[0]?.body).toMatchObject({
			// El `business_id` es obligatorio en el cuerpo además del path: sin él
			// la API responde 422.
			business_id: businessId,
			name: "Sucursal norte",
			address: "Av. norte 456",
			latitude: -0.1807,
			longitude: -78.4678,
			// Vacíos opcionales viajan como `null`, que es lo que acepta el contrato.
			phone: null,
			zone: null,
		});
		expect(typeof calls[0]?.body?.latitude).toBe("number");
		expect(typeof calls[0]?.body?.longitude).toBe("number");
	});

	// La regla de rango NO está en el contrato (`z.number()` a secas) y la columna
	// es `numeric(10,7)`: sin esto, "Cañaral" llega al servidor y vuelve un 422.
	test("rechaza coordenadas que no son números, en el campo", async () => {
		const { calls } = stubFetch(201, existing);
		renderForm();

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		fireEvent.change(screen.getByLabelText("Dirección"), {
			target: { value: "Av. norte 456" },
		});
		fireEvent.change(screen.getByLabelText("Latitud"), {
			target: { value: "Cañaral" },
		});
		fireEvent.change(screen.getByLabelText("Longitud"), {
			target: { value: "-78.4678" },
		});
		submit();

		await waitFor(() =>
			expect(screen.getByText("Ingresa un número")).toBeDefined(),
		);
		expect(calls).toHaveLength(0);
	});

	test("rechaza una latitud fuera de rango", async () => {
		const { calls } = stubFetch(201, existing);
		renderForm();

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		fireEvent.change(screen.getByLabelText("Dirección"), {
			target: { value: "Av. norte 456" },
		});
		fireEvent.change(screen.getByLabelText("Latitud"), {
			target: { value: "120" },
		});
		fireEvent.change(screen.getByLabelText("Longitud"), {
			target: { value: "-78.4678" },
		});
		submit();

		await waitFor(() =>
			expect(
				screen.getByText("La latitud debe estar entre -90 y 90"),
			).toBeDefined(),
		);
		expect(calls).toHaveLength(0);
	});

	// El 422 trae `details[{ path, message }]`: el mensaje va al campo que falló y
	// el `requestId` queda a la vista para cruzarlo con el log del servidor.
	test("un 422 muestra el requestId de la API y no cierra el formulario", async () => {
		stubFetch(422, {
			statusCode: 422,
			message: "Validation failed",
			requestId: "req-loc-0001",
			details: [
				{
					path: "name",
					message: "Too small: expected string to have >=1 characters",
				},
			],
		});
		let succeeded = false;
		renderForm(undefined, () => {
			succeeded = true;
		});

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		fireEvent.change(screen.getByLabelText("Dirección"), {
			target: { value: "Av. norte 456" },
		});
		fireEvent.change(screen.getByLabelText("Latitud"), {
			target: { value: "-0.1807" },
		});
		fireEvent.change(screen.getByLabelText("Longitud"), {
			target: { value: "-78.4678" },
		});
		submit();

		await waitFor(() =>
			expect(
				screen.getByText("Debe tener al menos 1 caracteres"),
			).toBeDefined(),
		);
		// El detalle por campo no lleva `requestId`, así que el identificador se
		// muestra aparte: si no, el operador vería QUÉ corregir y no podría
		// correlacionar el fallo con el log del servidor.
		expect(
			screen.getByText("Referencia para soporte: req-loc-0001"),
		).toBeDefined();
		expect(succeeded).toBe(false);
	});

	// Sin `details[]` no hay campo al que asociar el mensaje: se muestra el
	// general, y `formatApiError` le concatena el `requestId`.
	test("un error sin detalles de campo muestra el mensaje con su requestId", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "req-loc-0002",
		});
		renderForm();

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		fireEvent.change(screen.getByLabelText("Dirección"), {
			target: { value: "Av. norte 456" },
		});
		fireEvent.change(screen.getByLabelText("Latitud"), {
			target: { value: "-0.1807" },
		});
		fireEvent.change(screen.getByLabelText("Longitud"), {
			target: { value: "-78.4678" },
		});
		submit();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · req-loc-0002"),
			).toBeDefined(),
		);
		expect(
			screen.queryByText("Referencia para soporte: req-loc-0002"),
		).toBeNull();
	});
});

describe("form de punto de retiro — edición", () => {
	test("precarga los valores del punto de retiro", () => {
		stubFetch(200, existing);
		renderForm(existing);

		expect(
			(screen.getByLabelText("Nombre del punto de retiro") as HTMLInputElement)
				.value,
		).toBe("Sucursal del centro");
		expect((screen.getByLabelText("Latitud") as HTMLInputElement).value).toBe(
			"-0.1807",
		);
		expect((screen.getByLabelText("Longitud") as HTMLInputElement).value).toBe(
			"-78.4678",
		);
	});

	// El PATCH es parcial y `UpdateBusinessLocationSchema` omite `business_id` a
	// propósito: mandarlo sería mandar un campo que el contrato no admite.
	test("el PATCH no incluye business_id", async () => {
		const { calls } = stubFetch(200, { ...existing, name: "Sucursal norte" });
		renderForm(existing);

		fireEvent.change(screen.getByLabelText("Nombre del punto de retiro"), {
			target: { value: "Sucursal norte" },
		});
		submit();

		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain(
			`/businesses/${businessId}/locations/${locationId}`,
		);
		expect(calls[0]?.body).toMatchObject({ name: "Sucursal norte" });
		expect(calls[0]?.body).not.toHaveProperty("business_id");
	});
});
