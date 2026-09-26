import { afterEach, describe, expect, test } from "bun:test";
import type { BusinessDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessForm } from "../business.form";

/**
 * A19: los 400 de `ZodValidationPipe` (`details[{ path, message }]`) se
 * renderizaban como un solo párrafo arriba del drawer. El operador corregía un
 * nombre, guardaba, fallaba y tenía que diffear dos cadenas a ojo.
 */

const business: BusinessDto = {
	id: "11111111-1111-4111-8111-111111111111",
	owner_id: "22222222-2222-4222-8222-222222222222",
	name: "Café Central",
	type: "restaurant",
	slug: "cafe-central",
	image: null,
	cover_image: null,
	rating: null,
	review_count: null,
	description: null,
	phone: "+593 99 123 4567",
	email: "postulante@cafe-central.ec",
	website: null,
	commission_rate: null,
	balance: null,
	is_active: true,
	verification_status: "pending",
	verified_at: null,
	verified_by: null,
	rejection_reason: null,
	created_at: "2026-09-01T10:00:00.000Z",
	updated_at: "2026-09-01T10:00:00.000Z",
};

const previousFetch = globalThis.fetch;

function stubFetch(status: number, body: unknown) {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
}

function renderForm() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BusinessForm formId="business-form" business={business} />
		</QueryClientProvider>,
	);
}

async function submitForm() {
	const input = screen.getByLabelText("Nombre");
	// Valor válido para el schema del cliente: el error que interesa es el del
	// servidor, no el de la validación local (que cortaría el submit).
	fireEvent.change(input, { target: { value: "Café Central" } });
	// El botón "Guardar" vive en el footer del drawer; el form es lo que se
	// envía, así que se dispara el submit del <form>.
	const form = input.closest("form");
	if (!form) throw new Error("el form de negocio no se renderizó");
	fireEvent.submit(form);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("errores de validación del servidor", () => {
	test("el error de un campo aparece junto a ese campo, traducido", async () => {
		stubFetch(400, {
			statusCode: 400,
			message: "Validation failed",
			error: "Bad Request",
			details: [
				{
					path: "name",
					message: "Too small: expected string to have >=1 characters",
				},
			],
		});
		renderForm();

		await submitForm();

		await waitFor(() =>
			expect(
				screen.getByText("Debe tener al menos 1 caracteres"),
			).toBeDefined(),
		);
		// Associated al input, no a un párrafo suelto arriba del drawer.
		const nameInput = screen.getByLabelText("Nombre");
		expect(nameInput.getAttribute("aria-invalid")).toBe("true");
	});

	test("un error sin campo asociado se muestra como mensaje general", async () => {
		stubFetch(409, {
			statusCode: 409,
			message: "Business already verified",
		});
		renderForm();

		await submitForm();

		await waitFor(() =>
			expect(screen.getByText("Business already verified")).toBeDefined(),
		);
		// Sin `details` no hay campo al que pegarle el error: no se inventa uno.
		expect(screen.getByLabelText("Nombre").getAttribute("aria-invalid")).toBe(
			"false",
		);
	});

	// Un `details` cuyos paths no pertenecen a este form no puede quedarse sin
	// mensaje: se cae al texto general.
	test("un details sin paths de este form no deja el form mudo", async () => {
		stubFetch(400, {
			statusCode: 400,
			message: "Validation failed",
			details: [{ path: "slug", message: "Invalid input" }],
		});
		renderForm();

		await submitForm();

		await waitFor(() =>
			expect(screen.getByText("La validación falló")).toBeDefined(),
		);
	});
});
