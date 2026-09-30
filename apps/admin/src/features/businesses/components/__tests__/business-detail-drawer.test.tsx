import { afterEach, describe, expect, test } from "bun:test";
import type { BusinessDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessDetailDrawer } from "../business-detail-drawer";

const previousFetch = globalThis.fetch;

const applicant: BusinessDto = {
	id: "11111111-1111-4111-8111-111111111111",
	owner_id: "22222222-2222-4222-8222-222222222222",
	name: "Café Central",
	type: "restaurant",
	slug: "cafe-central",
	image: null,
	cover_image: null,
	rating: null,
	review_count: null,
	description: "Panadería de barrio con hornos de leña desde 1994.",
	phone: "+593 99 123 4567",
	email: "postulante@cafe-central.ec",
	website: "https://cafe-central.ec",
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

/**
 * La ficha consulta dos recursos hijos del negocio (notificaciones y puntos de
 * retiro), y cada uno tiene su propia forma de respuesta: los correos son un
 * array plano, las ubicaciones un sobre paginado. Un stub único que devuelva `[]`
 * para todo rompía la sección de ubicaciones, así que el stub enruta por URL.
 */
function stubFetch(
	routes: { emailSends?: unknown[]; locations?: unknown[] } = {},
) {
	globalThis.fetch = (async (input: string) => {
		const url = String(input);
		const body = url.includes("/locations")
			? {
					data: routes.locations ?? [],
					meta: {
						page: 1,
						limit: 100,
						total: routes.locations?.length ?? 0,
						total_pages: 1,
					},
				}
			: (routes.emailSends ?? []);
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function renderDrawer(business: BusinessDto) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BusinessDetailDrawer
				business={business}
				isOpen={true}
				onClose={() => undefined}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("ficha del negocio", () => {
	// Verificar sin ver al solicitante es un sello: la ficha es la evidencia mínima.
	test("muestra los datos de contacto y la descripción del solicitante", () => {
		stubFetch();

		renderDrawer(applicant);

		expect(screen.getByText("postulante@cafe-central.ec")).toBeDefined();
		expect(screen.getByText("+593 99 123 4567")).toBeDefined();
		expect(
			screen.getByText("Panadería de barrio con hornos de leña desde 1994."),
		).toBeDefined();
	});

	test("muestra el estado de verificación y el motivo de rechazo", () => {
		stubFetch();

		renderDrawer({
			...applicant,
			verification_status: "rejected",
			rejection_reason: "Documentos ilegibles",
		});

		// A12: el enum crudo (`rejected`) se muestra traducido en la ficha.
		expect(screen.getByText("Rechazado")).toBeDefined();
		expect(screen.getByText("Documentos ilegibles")).toBeDefined();
	});

	test("expone el historial de notificaciones por correo del negocio", async () => {
		stubFetch({
			emailSends: [
				{
					id: "send-1",
					business_id: applicant.id,
					email: "postulante@cafe-central.ec",
					template_name: "business-approved",
					status: "failed",
					// En los envíos fallidos desde a7fac68 el valor es la huella
					// acotada del fallo; en las filas anteriores no hay backfill y
					// sigue siendo el texto crudo de Resend. La etiqueta describe
					// el origen del dato sin prometer una redacción que las filas
					// históricas no tienen.
					error_message: "TypeError",
					created_at: "2026-09-01T10:05:00.000Z",
				},
			],
		});

		renderDrawer(applicant);

		await waitFor(() =>
			expect(screen.getByText("business-approved")).toBeDefined(),
		);
		expect(screen.getByText("Detalle del error del servidor")).toBeDefined();
		expect(screen.getByText("TypeError")).toBeDefined();
	});

	// Un negocio con varios puntos de retiro es el caso normal del marketplace:
	// sin esta sección el panel no mostraba ni una fila de ese dato.
	test("expone los puntos de retiro del negocio dentro de la ficha", async () => {
		stubFetch({
			locations: [
				{
					id: "33333333-3333-4333-8333-333333333333",
					business_id: applicant.id,
					name: "Sucursal del centro",
					address: "Av. principal 123",
					phone: null,
					latitude: -0.1807,
					longitude: -78.4678,
					is_active: true,
					zone: "Centro",
					is_headquarter: true,
					created_at: "2026-09-01T10:00:00.000Z",
					updated_at: "2026-09-01T10:00:00.000Z",
				},
			],
		});

		renderDrawer(applicant);

		await waitFor(() =>
			expect(screen.getByText("Sucursal del centro")).toBeDefined(),
		);
		expect(screen.getByText("Av. principal 123")).toBeDefined();
	});

	test("la ficha ofrece el alta de un punto de retiro", async () => {
		stubFetch();

		renderDrawer(applicant);

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Nuevo punto de retiro" }),
			).toBeDefined(),
		);
	});
});
