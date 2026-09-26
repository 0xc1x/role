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
		globalThis.fetch = (async () =>
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;

		renderDrawer(applicant);

		expect(screen.getByText("postulante@cafe-central.ec")).toBeDefined();
		expect(screen.getByText("+593 99 123 4567")).toBeDefined();
		expect(
			screen.getByText("Panadería de barrio con hornos de leña desde 1994."),
		).toBeDefined();
	});

	test("muestra el estado de verificación y el motivo de rechazo", () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;

		renderDrawer({
			...applicant,
			verification_status: "rejected",
			rejection_reason: "Documentos ilegibles",
		});

		expect(screen.getByText("rejected")).toBeDefined();
		expect(screen.getByText("Documentos ilegibles")).toBeDefined();
	});

	test("expone el historial de notificaciones por correo del negocio", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify([
					{
						id: "send-1",
						business_id: applicant.id,
						email: "postulante@cafe-central.ec",
						template_name: "business-approved",
						status: "failed",
						error_message: "SMTP 550 mailbox unavailable",
						created_at: "2026-09-01T10:05:00.000Z",
					},
				]),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;

		renderDrawer(applicant);

		await waitFor(() =>
			expect(screen.getByText("business-approved")).toBeDefined(),
		);
		expect(screen.getByText("SMTP 550 mailbox unavailable")).toBeDefined();
	});
});
