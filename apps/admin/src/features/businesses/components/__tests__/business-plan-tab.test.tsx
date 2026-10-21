import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessPlanTab } from "../business-plan-tab";

const previousFetch = globalThis.fetch;

const businessId = "11111111-1111-4111-8111-111111111111";

const FREE_PLAN = {
	code: "free",
	audience: "business",
	limits: { max_locations: 1, max_members: 2 },
	features: ["staff_access"],
};

const PRO_PLAN = {
	code: "pro",
	audience: "business",
	limits: { max_locations: 5, max_members: 20 },
	features: ["staff_access", "payments"],
};

const PRO_PLUS_PLAN = {
	code: "pro_plus",
	audience: "business",
	limits: { max_locations: null, max_members: null },
	features: ["staff_access", "payments", "visibility_plus"],
};

const CATALOGUE = [FREE_PLAN, PRO_PLAN, PRO_PLUS_PLAN];

function subscription(overrides: Record<string, unknown> = {}) {
	return {
		business_id: businessId,
		plan_code: "free",
		since: null,
		limits: FREE_PLAN.limits,
		features: FREE_PLAN.features,
		...overrides,
	};
}

const owner = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	business_id: businessId,
	user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	role: "owner",
	label: "María Dueña",
	alias: "maria@cafe-central.role.ec",
	status: "active",
	session_ttl_hours: 0,
	business_location_ids: [],
	last_authenticated_at: null,
	created_at: "2026-10-01T10:00:00.000Z",
	updated_at: "2026-10-01T10:00:00.000Z",
	deleted_at: null,
};

const staff = {
	...owner,
	id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
	role: "staff",
	label: "Ana Empleada",
	alias: "ana@cafe-central.role.ec",
};

const locations = [
	{
		id: "33333333-3333-4333-8333-333333333333",
		business_id: businessId,
		name: "Sucursal del centro",
		address: "Av. principal 123",
		phone: null,
		latitude: -0.1807,
		longitude: -78.4678,
		is_active: true,
		zone: "Centro",
		is_headquarter: true,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
	},
	{
		id: "44444444-4444-4444-8444-444444444444",
		business_id: businessId,
		name: "Sucursal del norte",
		address: "Av. otra 456",
		phone: null,
		latitude: -0.1907,
		longitude: -78.4778,
		is_active: true,
		zone: "Norte",
		is_headquarter: false,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
	},
];

interface RecordedCall {
	url: string;
	method: string;
	body?: unknown;
}

/**
 * El doble enruta por URL y por método: el catálogo es un arreglo pelado, la
 * suscripción es un objeto, las ubicaciones son un sobre paginado, el equipo es
 * un arreglo y la asignación es un PATCH que puede contestar 422. Un stub único
 * no podría responder las cinco formas.
 */
function stubFetch(
	options: {
		subscription?: unknown;
		catalogue?: unknown[];
		/** El catálogo falla: es la rama de error de la lectura. */
		catalogueError?: { status?: number; body?: unknown };
		locations?: unknown[];
		staff?: unknown[];
		patch?: { status?: number; body?: unknown };
	} = {},
) {
	const calls: RecordedCall[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		calls.push({
			url,
			method,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});

		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			});

		if (method === "PATCH" && url.includes("/subscription")) {
			const patch = options.patch ?? {
				status: 200,
				body: subscription({ plan_code: "pro" }),
			};
			return json(patch.body, patch.status ?? 200);
		}
		if (method === "GET" && url.includes("/subscription")) {
			return json(options.subscription ?? subscription());
		}
		if (method === "GET" && url.includes("/plans")) {
			if (options.catalogueError) {
				return json(
					options.catalogueError.body ?? { message: "Internal server error" },
					options.catalogueError.status ?? 500,
				);
			}
			return json(options.catalogue ?? CATALOGUE);
		}
		if (method === "GET" && url.includes("/locations")) {
			const rows = options.locations ?? [];
			return json({
				data: rows,
				meta: { page: 1, limit: 100, total: rows.length, total_pages: 1 },
			});
		}
		if (method === "GET" && url.includes("/staff")) {
			return json(options.staff ?? []);
		}
		return json([]);
	}) as unknown as typeof fetch;
	return calls;
}

function renderTab(id: string | null = businessId) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BusinessPlanTab businessId={id} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("pestaña Plan del negocio", () => {
	// Un negocio sin suscripción NO tiene fecha: el panel no puede inventar
	// una, porque «desde cuándo» es un dato que la base no tiene.
	test("un negocio sin suscripción se lee como Gratis y sin fecha inventada", async () => {
		stubFetch();
		renderTab();

		await waitFor(() => expect(screen.getByText("Gratis")).toBeDefined());
		expect(screen.getByText("sin suscripción registrada")).toBeDefined();
		// Ninguna fecha en la pantalla: la fecha del plan no existe.
		expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).toBeNull();
	});

	test("con pro se muestran el plan, los topes y las features traducidas", async () => {
		stubFetch({
			subscription: subscription({
				plan_code: "pro",
				since: "2026-10-01T10:00:00.000Z",
				limits: PRO_PLAN.limits,
				features: PRO_PLAN.features,
			}),
		});
		renderTab();

		await waitFor(() => expect(screen.getByText("Pro")).toBeDefined());
		// El tope del catálogo, tal como lo aplica el motor.
		expect(screen.getByText("5")).toBeDefined();
		expect(screen.getByText("20")).toBeDefined();
		// Las features traducidas, nunca crudas.
		expect(screen.getByText("Pagos")).toBeDefined();
		expect(screen.getByText("Accesos de personal")).toBeDefined();
		expect(screen.queryByText("staff_access")).toBeNull();
		expect(screen.queryByText("payments")).toBeNull();
		expect(screen.queryByText("pro")).toBeNull();
	});

	// `null` es «sin tope» y NO es cero: un 0 leería como «no admite nada».
	test("un plan sin tope lo dice en palabras y no pinta un cero", async () => {
		stubFetch({
			subscription: subscription({
				plan_code: "pro_plus",
				since: "2026-10-01T10:00:00.000Z",
				limits: PRO_PLUS_PLAN.limits,
				features: PRO_PLUS_PLAN.features,
			}),
			locations,
			staff: [owner, staff],
		});
		renderTab();

		await waitFor(() => expect(screen.getByText("Pro Plus")).toBeDefined());
		expect(screen.getAllByText("sin tope").length).toBeGreaterThan(0);
		expect(screen.queryByText("0")).toBeNull();
	});

	test("sin negocio no consulta nada", () => {
		const calls = stubFetch();
		renderTab(null);

		expect(calls).toHaveLength(0);
	});

	// Si el catálogo no llega, el panel NO ofrece el botón: sin los planes en
	// oferta no hay nada que asignar, y un diálogo vacío es una puerta falsa.
	test("sin catálogo no se ofrece cambiar el plan", async () => {
		stubFetch({ catalogueError: { status: 500, body: { message: "boom" } } });
		renderTab();

		await waitFor(() =>
			expect(
				screen.getByText(
					"No se pudo cargar el catálogo de planes: no se puede asignar uno.",
				),
			).toBeDefined(),
		);
		expect(screen.queryByRole("button", { name: "Cambiar plan" })).toBeNull();
	});

	// El admin no expulsa a nadie y no le cambia el acceso a nadie: la única
	// acción de la pestaña es asignar el plan.
	test("el uso contra el tope se muestra como texto y no como acción", async () => {
		stubFetch({
			subscription: subscription({
				plan_code: "pro",
				since: "2026-10-01T10:00:00.000Z",
				limits: PRO_PLAN.limits,
				features: PRO_PLAN.features,
			}),
			locations,
			staff: [owner, staff],
		});
		renderTab();

		await waitFor(() => expect(screen.getByText("2 de 5")).toBeDefined());
		// El dueño no consume cupo: sólo se cuenta el resto del equipo.
		expect(screen.getByText("1 de 20")).toBeDefined();
		// Los rótulos atan cada número a lo que cuenta.
		expect(screen.getAllByText("Sucursales")).toHaveLength(2);
		expect(screen.getAllByText("Miembros")).toHaveLength(2);
		// La única acción de la pestaña es cambiar el plan.
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent).toContain("Cambiar plan");
	});
});

describe("cambio de plan desde el panel", () => {
	test("pide confirmación y no asigna nada hasta que se confirma", async () => {
		const calls = stubFetch();
		renderTab();

		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar plan" }),
		);

		const dialog = await screen.findByRole("alertdialog");
		// Los tres planes del catálogo, con sus límites a la vista.
		expect(dialog.textContent).toContain("Gratis");
		expect(dialog.textContent).toContain("Pro");
		expect(dialog.textContent).toContain("Pro Plus");
		expect(dialog.textContent).toContain("5 sucursales");
		expect(dialog.textContent).toContain("20 miembros");
		// Todavía no se asignó nada.
		expect(calls.some((call) => call.method === "PATCH")).toBe(false);

		fireEvent.click(screen.getByRole("radio", { name: "Pro" }));

		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar a Pro" }),
		);

		await waitFor(() =>
			expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1),
		);
		const patch = calls.find((call) => call.method === "PATCH");
		expect(patch?.url).toContain(`/businesses/${businessId}/subscription`);
		expect(patch?.body).toEqual({ plan_code: "pro" });
	});

	// La consecuencia de bajar de plan (§5.4): nada se corta, el negocio sigue
	// operando y lo único que se detiene es el crecimiento.
	test("el diálogo dice qué pasa al bajar de plan", async () => {
		stubFetch();
		renderTab();

		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar plan" }),
		);

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("no se corta");
		expect(dialog.textContent).toContain("crecer");
	});

	// La asignación que sí se aplica se avisa y cierra el diálogo.
	test("una asignación correcta se avisa y cierra el diálogo", async () => {
		stubFetch();
		const success = spyOn(toast, "success");
		renderTab();

		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar plan" }),
		);
		fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar a Pro" }),
		);

		await waitFor(() => expect(success).toHaveBeenCalled());
		expect(String(success.mock.calls[0]?.[0])).toContain(
			"Plan cambiado a Pro.",
		);
		// La decisión ya se tomó: el diálogo se cierra.
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	});

	// El 422 del API (plan fuera del catálogo) se ve con su requestId, que es
	// lo único que permite cruzarlo con el log del servidor.
	test("el 422 del API se avisa con el requestId y deja el diálogo abierto", async () => {
		stubFetch({
			patch: {
				status: 422,
				body: {
					statusCode: 422,
					message: "Ese plan no existe.",
					requestId: "req-plan-01",
				},
			},
		});
		const error = spyOn(toast, "error");
		renderTab();

		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar plan" }),
		);
		fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
		fireEvent.click(
			await screen.findByRole("button", { name: "Cambiar a Pro" }),
		);

		await waitFor(() => expect(error).toHaveBeenCalled());
		const message = String(error.mock.calls[0]?.[0]);
		expect(message).toContain("Ese plan no existe.");
		expect(message).toContain("req-plan-01");
		// La asignación no se aplicó: el diálogo sigue pidiendo la decisión.
		expect(await screen.findByRole("alertdialog")).toBeDefined();
	});
});
