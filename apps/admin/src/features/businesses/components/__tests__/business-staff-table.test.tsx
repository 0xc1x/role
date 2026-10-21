import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { BusinessMemberDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessStaffTable } from "../business-staff-table";

const previousFetch = globalThis.fetch;

const businessId = "11111111-1111-4111-8111-111111111111";
const businessName = "Café Central";
const locationId = "33333333-3333-4333-8333-333333333333";

function member(
	overrides: Pick<
		BusinessMemberDto,
		"id" | "label" | "alias" | "role" | "status"
	> &
		Partial<BusinessMemberDto>,
): BusinessMemberDto {
	return {
		business_id: businessId,
		user_id: overrides.id,
		session_ttl_hours: 0,
		business_location_ids: [],
		last_authenticated_at: null,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
		deleted_at: null,
		...overrides,
	};
}

const owner = member({
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	label: "María Dueña",
	alias: "maria@cafe-central.role.ec",
	role: "owner",
	status: "active",
	// El dueño alcanza el negocio entero con o sin filas de alcance (§5.1).
	business_location_ids: [],
});

const manager = member({
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	label: "Jorge Gerente",
	alias: "jorge@cafe-central.role.ec",
	role: "manager",
	status: "active",
	business_location_ids: [locationId],
});

const staff = member({
	id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	label: "Ana Empleada",
	alias: "ana@cafe-central.role.ec",
	role: "staff",
	status: "disabled",
	business_location_ids: [],
});

const members = [owner, manager, staff];

const location = {
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
	created_at: "2026-10-01T10:00:00.000Z",
	updated_at: "2026-10-01T10:00:00.000Z",
};

interface RecordedCall {
	url: string;
	method: string;
}

/**
 * El doble enruta por URL y por método: la lista del equipo es un arreglo pelado,
 * las ubicaciones son un sobre paginado y el corte es un POST que devuelve el
 * sobre de `RevokeBusinessAccessResponseDto`. Un stub único no podría responder
 * las tres formas.
 */
function stubFetch(
	options: {
		staff?: unknown[];
		/** El GET del equipo falla: es la rama de error de la lectura. */
		staffError?: { status?: number; body?: unknown };
		locations?: unknown[];
		/** La lista de puntos de retiro no llega nunca. */
		locationsPending?: boolean;
		revoke?: { status?: number; body?: unknown };
		/** El corte queda en vuelo: el POST no responde nunca. */
		revokePending?: boolean;
	} = {},
) {
	const calls: RecordedCall[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method });

		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			});

		if (method === "POST" && url.includes("/staff/revoke-all")) {
			if (options.revokePending) {
				// El corte no termina: el botón queda deshabilitado y su nombre
				// accesible tiene que seguir siendo el mismo.
				await new Promise<void>(() => undefined);
			}
			const revoke = options.revoke ?? {
				status: 200,
				body: { disabled: [], owner_skipped: true },
			};
			return json(revoke.body, revoke.status ?? 200);
		}
		if (method === "GET" && url.includes("/staff")) {
			if (options.staffError) {
				return json(
					options.staffError.body ?? { message: "Internal server error" },
					options.staffError.status ?? 500,
				);
			}
			return json(options.staff ?? []);
		}
		if (method === "GET" && url.includes("/locations")) {
			if (options.locationsPending) {
				await new Promise<void>(() => undefined);
			}
			const rows = options.locations ?? [];
			return json({
				data: rows,
				meta: { page: 1, limit: 100, total: rows.length, total_pages: 1 },
			});
		}
		return json([]);
	}) as unknown as typeof fetch;
	return calls;
}

function renderTable(id: string | null = businessId) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BusinessStaffTable businessId={id} businessName={businessName} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("equipo del negocio (sólo lectura)", () => {
	test("lista los accesos con su nombre, alias, rol y estado", async () => {
		stubFetch({ staff: members, locations: [location] });
		renderTable();

		await waitFor(() => expect(screen.getByText("María Dueña")).toBeDefined());

		expect(screen.getByText("Jorge Gerente")).toBeDefined();
		expect(screen.getByText("Ana Empleada")).toBeDefined();
		expect(screen.getByText("maria@cafe-central.role.ec")).toBeDefined();
		expect(screen.getByText("jorge@cafe-central.role.ec")).toBeDefined();
		expect(screen.getByText("ana@cafe-central.role.ec")).toBeDefined();
	});

	// Un rol mal leído es un alcance mal entendido: `staff` no administra el
	// equipo y `owner` sí.
	test("el rol sale traducido, nunca crudo", async () => {
		stubFetch({ staff: members, locations: [location] });
		renderTable();

		await waitFor(() => expect(screen.getByText("María Dueña")).toBeDefined());

		expect(screen.getByText("Dueño")).toBeDefined();
		expect(screen.getByText("Gerente")).toBeDefined();
		expect(screen.getByText("Empleado")).toBeDefined();
		expect(screen.queryByText("owner")).toBeNull();
		expect(screen.queryByText("manager")).toBeNull();
		expect(screen.queryByText("staff")).toBeNull();
	});

	test("el estado sale traducido, nunca crudo", async () => {
		stubFetch({ staff: members, locations: [location] });
		renderTable();

		await waitFor(() => expect(screen.getByText("María Dueña")).toBeDefined());

		expect(screen.getAllByText("Activo")).toHaveLength(2);
		expect(screen.getByText("Pausado")).toBeDefined();
		expect(screen.queryByText("active")).toBeNull();
		expect(screen.queryByText("disabled")).toBeNull();
	});

	// El alcance vacío NO es «todo»: sólo el dueño alcanza el negocio entero.
	test("las sucursales dicen el alcance de cada acceso", async () => {
		stubFetch({ staff: members, locations: [location] });
		renderTable();

		await waitFor(() =>
			expect(screen.getByText("Sucursal del centro")).toBeDefined(),
		);
		expect(screen.getByText("Todo el negocio")).toBeDefined();
		expect(screen.getByText("Sin sucursales")).toBeDefined();
	});

	// La plataforma administra: no da de alta ni edita accesos desde el panel.
	test("no ofrece ni alta ni edición de accesos", async () => {
		stubFetch({ staff: members, locations: [location] });
		renderTable();

		await waitFor(() => expect(screen.getByText("María Dueña")).toBeDefined());

		expect(
			screen.queryByRole("button", { name: /alta|crear|editar|modificar/i }),
		).toBeNull();
		expect(screen.getAllByRole("button")).toHaveLength(1);
	});

	test("sin negocio no consulta nada", () => {
		const calls = stubFetch({ staff: members, locations: [location] });
		renderTable(null);

		expect(calls).toHaveLength(0);
	});

	test("dice que no hay accesos nombrando al negocio", async () => {
		stubFetch({ staff: [] });
		renderTable();

		await waitFor(() =>
			expect(
				screen.getByText(`Sin accesos registrados para ${businessName}.`),
			).toBeDefined(),
		);
	});

	// Si la lectura falla, se dice POR QUÉ y no se inventan filas: un roster
	// vacío por un error de red se lee como «este negocio no tiene equipo».
	test("un fallo de la API se muestra y no deja filas pintadas", async () => {
		stubFetch({
			staffError: {
				status: 500,
				body: { statusCode: 500, message: "Internal server error" },
			},
		});
		renderTable();

		await waitFor(() =>
			expect(screen.getByText("Error interno del servidor")).toBeDefined(),
		);
		expect(screen.queryByText("María Dueña")).toBeNull();
		expect(screen.queryByRole("table")).toBeNull();
	});

	// El roster puede llegar antes que la lista de puntos de retiro. Un «—» en
	// esa celda diría «este acceso no tiene alcance» cuando lo que pasa es que
	// todavía no se sabe: mientras tanto hay un esqueleto.
	test("mientras no llegan los nombres de las sucursales, la celda es un esqueleto", async () => {
		stubFetch({ staff: members, locationsPending: true });
		renderTable();

		await waitFor(() => expect(screen.getByText("María Dueña")).toBeDefined());
		const managerRow = screen.getByText("Jorge Gerente").closest("tr");
		expect(managerRow?.textContent).not.toContain("—");
		expect(managerRow?.querySelector("[data-slot='skeleton']")).not.toBeNull();

		// El dueño y el empleado no dependen de la lista: su alcance se sabe
		// sin ella.
		expect(screen.getByText("Todo el negocio")).toBeDefined();
		expect(screen.getByText("Sin sucursales")).toBeDefined();
	});

	// Un id de alcance que no está en la lista de puntos de retiro no tiene
	// nombre: se deja el hueco en vez de inventar uno.
	test("un acceso con una sucursal que no existe deja el hueco, no un nombre", async () => {
		const unknownLocationId = "99999999-9999-4999-8999-999999999999";
		stubFetch({
			staff: [
				owner,
				manager,
				member({
					id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
					label: "Luis Repartidor",
					alias: "luis@cafe-central.role.ec",
					role: "staff",
					status: "active",
					business_location_ids: [unknownLocationId],
				}),
			],
			locations: [location],
		});
		renderTable();

		// Los nombres que sí resuelven se pintan.
		await waitFor(() =>
			expect(screen.getByText("Sucursal del centro")).toBeDefined(),
		);
		const knownRow = screen.getByText("Jorge Gerente").closest("tr");
		expect(knownRow?.textContent).toContain("Sucursal del centro");

		// Y el que no resuelve queda con el hueco, en su propia fila.
		const unknownRow = screen.getByText("Luis Repartidor").closest("tr");
		expect(unknownRow?.textContent).toContain("—");
		expect(unknownRow?.textContent).not.toContain("Sucursal del centro");
	});
});

describe("corte de emergencia desde el panel", () => {
	test("pide confirmación y no corta nada hasta que se confirma", async () => {
		const calls = stubFetch({ staff: members, locations: [location] });
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Cortar todos los accesos?");
		expect(dialog.textContent).toContain(businessName);
		// Las sesiones abiertas también se van: el diálogo lo dice.
		expect(dialog.textContent).toContain("sesiones abiertas");
		// Todavía no se cortó nada.
		expect(calls.some((call) => call.method === "POST")).toBe(false);

		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		await waitFor(() =>
			expect(calls.filter((call) => call.method === "POST")).toHaveLength(1),
		);
		const post = calls.find((call) => call.method === "POST");
		expect(post?.url).toContain(`/businesses/${businessId}/staff/revoke-all`);
	});

	test("mientras el corte corre el botón no cambia de nombre ni admite otro clic", async () => {
		const calls = stubFetch({
			staff: members,
			locations: [location],
			revokePending: true,
		});
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		// El nombre accesible tiene que seguir siendo EXACTO «Cortar los
		// accesos»: con el spinner dentro, el botón se llamaba «Loading Cortar
		// los accesos» y era otro botón para el lector de pantalla.
		await waitFor(() => {
			const confirm = screen.getByRole("button", {
				name: "Cortar los accesos",
			}) as HTMLButtonElement;
			expect(confirm.disabled).toBe(true);
		});
		// Un solo POST: el corte en vuelo no se repite.
		expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
	});

	test("el aviso dice cuántos accesos se cortaron y si el dueño quedó adentro", async () => {
		stubFetch({
			staff: members,
			locations: [location],
			revoke: {
				status: 200,
				body: { disabled: [manager, staff], owner_skipped: true },
			},
		});
		const success = spyOn(toast, "success");
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		await waitFor(() => expect(success).toHaveBeenCalled());
		const message = String(success.mock.calls[0]?.[0]);
		expect(message).toContain("Se cortaron 2 accesos.");
		expect(message).toContain("El dueño quedó adentro.");
	});

	test("un corte de un solo acceso lo dice en singular", async () => {
		stubFetch({
			staff: members,
			locations: [location],
			revoke: {
				status: 200,
				body: { disabled: [staff], owner_skipped: false },
			},
		});
		const success = spyOn(toast, "success");
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		await waitFor(() => expect(success).toHaveBeenCalled());
		const message = String(success.mock.calls[0]?.[0]);
		expect(message).toContain("Se cortó 1 acceso.");
		// Sin `owner_skipped` la frase del dueño no aparece: es un hecho de la
		// respuesta, no una cortesía del panel.
		expect(message).not.toContain("El dueño quedó adentro.");
	});

	// «Se cortaron 0 accesos» se lee como un fallo; el negocio ya limpio es un
	// resultado, y tiene su propia frase.
	test("un negocio sin accesos activos que cortar lo dice así", async () => {
		stubFetch({
			staff: members,
			locations: [location],
			revoke: {
				status: 200,
				body: { disabled: [], owner_skipped: false },
			},
		});
		const success = spyOn(toast, "success");
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		await waitFor(() => expect(success).toHaveBeenCalled());
		expect(String(success.mock.calls[0]?.[0])).toContain(
			"No había accesos activos que cortar.",
		);
	});

	test("un fallo del corte avisa con el requestId y deja el diálogo abierto", async () => {
		stubFetch({
			staff: members,
			locations: [location],
			revoke: {
				status: 409,
				body: {
					statusCode: 409,
					message: "Conflict",
					requestId: "req-staff-01",
				},
			},
		});
		const error = spyOn(toast, "error");
		renderTable();

		fireEvent.click(
			await screen.findByRole("button", {
				name: `Cortar todos los accesos de ${businessName}`,
			}),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Cortar los accesos" }),
		);

		// Sin el `requestId` el operador no puede cruzar el fallo con el log.
		await waitFor(() => expect(error).toHaveBeenCalled());
		expect(String(error.mock.calls[0]?.[0])).toContain("req-staff-01");
		// El corte no se aplicó: el diálogo sigue abierto.
		expect(await screen.findByRole("alertdialog")).toBeDefined();
	});
});
