import { afterEach, describe, expect, test } from "bun:test";
import type { BusinessDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table/data-table";
import { cleanup, render, screen } from "@/test-utils/dom";
import { columns } from "../businesses.columns";

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
	description: "Panadería de barrio con hornos de leña.",
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

function renderTable() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<DataTable
				columns={columns}
				data={[applicant]}
				meta={{ page: 1, limit: 10, total: 1, total_pages: 1 }}
			/>
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("columnas de negocios", () => {
	// El correo y el teléfono son la vía de contacto del solicitante: sin ellos
	// la tabla no permite decidir una verificación.
	test("muestran el correo y el teléfono del solicitante", () => {
		renderTable();

		expect(screen.getByText("postulante@cafe-central.ec")).toBeDefined();
		expect(screen.getByText("+593 99 123 4567")).toBeDefined();
	});

	test("muestran guion en vez de celda vacía si no hay contacto", () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		render(
			<QueryClientProvider client={queryClient}>
				<DataTable
					columns={columns}
					data={[{ ...applicant, email: null, phone: null }]}
					meta={{ page: 1, limit: 10, total: 1, total_pages: 1 }}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
	});
});
