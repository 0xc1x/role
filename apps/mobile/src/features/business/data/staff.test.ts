import { beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BusinessMemberDto } from "@0xc1x/role-commons";

/**
 * Los accesos del equipo, por el API.
 *
 * ─── POR QUÉ UN DOBLE DE `api` Y NO UN SERVIDOR ───────────────────────────────
 *
 * El módulo bajo prueba habla con el API por el cliente de la Task 1, y lo que
 * importa acá es el CONTRATO: qué verbo, qué ruta y qué cuerpo. Un doble de
 * `api` deja esa frontera a la vista; un servidor de mentira la escondería
 * detrás de un JSON que uno mismo escribe.
 *
 * Y la respuesta se valida en la frontera con el schema de commons: un 2xx con
 * un cuerpo que no cumple el contrato es una rotura del servidor, y el cliente
 * tiene que fallar en voz alta en vez de confiar en lo que le mandan.
 */

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION_ID = "44444444-4444-4444-8444-444444444444";

/** Un acceso tal como lo ve el panel. */
const MIEMBRO: BusinessMemberDto = {
	id: MEMBER_ID,
	business_id: BUSINESS_ID,
	user_id: USER_ID,
	role: "staff",
	label: "Ana",
	alias: "ana@panaderia.role.ec",
	status: "active",
	session_ttl_hours: 0,
	business_location_ids: [LOCATION_ID],
	last_authenticated_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
	deleted_at: null,
};

/** La tarjeta de entrega: la ÚNICA respuesta que lleva el PIN. */
const TARJETA = {
	alias: "ana@panaderia.role.ec",
	pin: "482913",
	alias_warnings: [],
};

const apiGet = jest.fn<(path: string) => Promise<unknown>>();
const apiPost = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const apiPatch = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const apiDelete = jest.fn<(path: string) => Promise<unknown>>();

mock.module("@/src/core/api/client", () => ({
	api: {
		get: apiGet,
		post: apiPost,
		patch: apiPatch,
		delete: apiDelete,
	},
}));

// Los hooks del negocio viven en el mismo módulo que estos hooks, y ese módulo
// arrastra repositorios que hablan con Supabase: sin estos dobles, el fichero
// no llega a cargarse.
mock.module("sonner-native", () => ({
	toast: { error: () => {}, success: () => {} },
}));
mock.module("@/src/features/business/data/repository", () => ({
	businessRepository: {},
	deleteOffer: mock(async () => undefined),
	saveOffer: mock(async () => ({ imageUploadFailed: false })),
}));
mock.module("@/src/features/business/data/notifications", () => ({
	notificationRepository: {
		getPreferences: mock(async () => ({})),
		updatePreferences: mock(async () => ({})),
	},
}));
mock.module("@/src/features/orders/data/repository", () => ({
	orderRepository: {},
}));

const { aliasWarnings, staffRepository } = await import(
	"@/src/features/business/data/staff"
);
const hooks = await import("@/src/features/business/hooks");

beforeEach(() => {
	apiGet.mockReset();
	apiPost.mockReset();
	apiPatch.mockReset();
	apiDelete.mockReset();
});

describe("staffRepository: las rutas y los verbos", () => {
	test("la lista pega en GET /businesses/:id/staff", async () => {
		apiGet.mockResolvedValue([MIEMBRO]);

		const members = await staffRepository.list(BUSINESS_ID);

		expect(apiGet).toHaveBeenCalledTimes(1);
		expect(apiGet.mock.calls[0]?.[0]).toBe(`/businesses/${BUSINESS_ID}/staff`);
		expect(members).toEqual([MIEMBRO]);
	});

	test("el alta pega en POST /businesses/:id/staff con el cuerpo", async () => {
		apiPost.mockResolvedValue(TARJETA);
		const body = {
			label: "Ana",
			role: "staff" as const,
			business_location_ids: [LOCATION_ID],
		};

		const card = await staffRepository.create(BUSINESS_ID, body);

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(apiPost.mock.calls[0]?.[0]).toBe(`/businesses/${BUSINESS_ID}/staff`);
		expect(apiPost.mock.calls[0]?.[1]).toEqual(body);
		expect(card).toEqual(TARJETA);
	});

	test("la edición pega en PATCH /businesses/:id/staff/:memberId", async () => {
		apiPatch.mockResolvedValue(MIEMBRO);
		const body = { role: "manager" as const, business_location_ids: [] };

		const member = await staffRepository.update(BUSINESS_ID, MEMBER_ID, body);

		expect(apiPatch).toHaveBeenCalledTimes(1);
		expect(apiPatch.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}`,
		);
		expect(apiPatch.mock.calls[0]?.[1]).toEqual(body);
		expect(member).toEqual(MIEMBRO);
	});

	test("el alias pega en PATCH /businesses/:id/staff/:memberId/alias", async () => {
		apiPatch.mockResolvedValue({
			member: MIEMBRO,
			alias_warnings: [],
		});

		const response = await staffRepository.updateAlias(
			BUSINESS_ID,
			MEMBER_ID,
			"ana@panaderia.role.ec",
		);

		expect(apiPatch).toHaveBeenCalledTimes(1);
		expect(apiPatch.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/alias`,
		);
		expect(apiPatch.mock.calls[0]?.[1]).toEqual({
			alias: "ana@panaderia.role.ec",
		});
		expect(response.member).toEqual(MIEMBRO);
		expect(response.alias_warnings).toEqual([]);
	});

	test("la rotación pega en POST .../:memberId/rotate y NO manda cuerpo", async () => {
		apiPost.mockResolvedValue(TARJETA);

		const card = await staffRepository.rotate(BUSINESS_ID, MEMBER_ID);

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(apiPost.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/rotate`,
		);
		// El PIN lo elige el servidor: un cuerpo con algo adentro sería una
		// puerta de atrás para que el cliente escoja su propia credencial.
		expect(apiPost.mock.calls[0]).toHaveLength(1);
		expect(card).toEqual(TARJETA);
	});

	test("pausar pega en POST .../:memberId/disable y reactivar en .../enable", async () => {
		apiPost.mockResolvedValue(MIEMBRO);

		await staffRepository.disable(BUSINESS_ID, MEMBER_ID);
		await staffRepository.enable(BUSINESS_ID, MEMBER_ID);

		expect(apiPost.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/disable`,
		);
		expect(apiPost.mock.calls[1]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/enable`,
		);
		expect(apiPost.mock.calls[0]).toHaveLength(1);
		expect(apiPost.mock.calls[1]).toHaveLength(1);
	});

	test("dar de baja pega en DELETE .../:memberId y no devuelve cuerpo", async () => {
		apiDelete.mockResolvedValue(undefined);

		const result = await staffRepository.remove(BUSINESS_ID, MEMBER_ID);

		expect(apiDelete).toHaveBeenCalledTimes(1);
		expect(apiDelete.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}`,
		);
		expect(result).toBeUndefined();
	});

	test("la transferencia NO va bajo /staff: va a /ownership/transfer", async () => {
		apiPost.mockResolvedValue({
			previous_owner: { ...MIEMBRO, role: "manager" },
			new_owner: { ...MIEMBRO, role: "owner" },
		});

		const response = await staffRepository.transferOwnership(
			BUSINESS_ID,
			MEMBER_ID,
		);

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(apiPost.mock.calls[0]?.[0]).toBe(
			`/businesses/${BUSINESS_ID}/ownership/transfer`,
		);
		expect(apiPost.mock.calls[0]?.[1]).toEqual({
			new_owner_member_id: MEMBER_ID,
		});
		expect(response.new_owner.role).toBe("owner");
		expect(response.previous_owner.role).toBe("manager");
	});
});

describe("staffRepository: la frontera se valida con zod", () => {
	test("una lista con un rol fuera del vocabulario falla", async () => {
		apiGet.mockResolvedValue([
			{ ...MIEMBRO, role: "jefe" as unknown as BusinessMemberDto["role"] },
		]);

		await expect(staffRepository.list(BUSINESS_ID)).rejects.toThrow();
	});

	test("la lista es un arreglo pelado: { members } no es la respuesta", async () => {
		apiGet.mockResolvedValue({ members: [MIEMBRO] });

		await expect(staffRepository.list(BUSINESS_ID)).rejects.toThrow();
	});

	test("un miembro con un rol fuera del vocabulario falla", async () => {
		apiPost.mockResolvedValue({
			...MIEMBRO,
			role: "jefe" as unknown as BusinessMemberDto["role"],
		});

		await expect(
			staffRepository.disable(BUSINESS_ID, MEMBER_ID),
		).rejects.toThrow();
	});

	test("un miembro con un PIN de menos de seis dígitos no pasa por la tarjeta", async () => {
		apiPost.mockResolvedValue({ ...TARJETA, pin: "48291" });

		await expect(
			staffRepository.create(BUSINESS_ID, {
				label: "Ana",
				business_location_ids: [LOCATION_ID],
			}),
		).rejects.toThrow();
	});

	test("la edición se valida contra el schema del miembro", async () => {
		apiPatch.mockResolvedValue({ ...MIEMBRO, status: "inventado" });

		await expect(
			staffRepository.update(BUSINESS_ID, MEMBER_ID, {
				role: "manager",
			}),
		).rejects.toThrow();
	});

	test("la transferencia se valida contra el schema de las dos membresías", async () => {
		apiPost.mockResolvedValue({ new_owner: MIEMBRO });

		await expect(
			staffRepository.transferOwnership(BUSINESS_ID, MEMBER_ID),
		).rejects.toThrow();
	});
});

describe("staffRepository: el alias se valida ANTES de salir del dispositivo", () => {
	test("cambiar el alias a algo que no es un correo no llama al API", async () => {
		await expect(
			staffRepository.updateAlias(BUSINESS_ID, MEMBER_ID, "ana@"),
		).rejects.toMatchObject({ kind: "validation" });
		expect(apiPatch).toHaveBeenCalledTimes(0);
	});

	test("dar de alta con un alias inválido no llama al API", async () => {
		await expect(
			staffRepository.create(BUSINESS_ID, {
				label: "Ana",
				alias: "ana@",
				business_location_ids: [LOCATION_ID],
			}),
		).rejects.toMatchObject({ kind: "validation" });
		expect(apiPost).toHaveBeenCalledTimes(0);
	});

	test("dar de alta SIN alias sí sale: lo genera el servidor", async () => {
		apiPost.mockResolvedValue(TARJETA);

		await staffRepository.create(BUSINESS_ID, {
			label: "Ana",
			business_location_ids: [LOCATION_ID],
		});

		expect(apiPost).toHaveBeenCalledTimes(1);
	});

	test("dar de alta con un alias válido sale con el alias", async () => {
		apiPost.mockResolvedValue(TARJETA);

		await staffRepository.create(BUSINESS_ID, {
			label: "Ana",
			alias: "ana@panaderia.role.ec",
			business_location_ids: [LOCATION_ID],
		});

		expect(apiPost.mock.calls[0]?.[1]).toMatchObject({
			alias: "ana@panaderia.role.ec",
		});
	});
});

describe("aliasWarnings: una sola fuente para «este dominio recibe correo»", () => {
	test("un dominio propio recibe correo: el aviso va", () => {
		expect(aliasWarnings("caja@panaderialafamilia.ec")).toEqual([
			"alias_domain_can_receive_mail",
		]);
	});

	test("una cuenta de equipo de Rolé no avisa", () => {
		expect(aliasWarnings("caja@centro.role.ec")).toEqual([]);
	});

	test("el ápice de Rolé tampoco avisa", () => {
		expect(aliasWarnings("centro@role.ec")).toEqual([]);
	});
});

describe("los hooks del equipo", () => {
	/**
	 * Monta un hook en un QueryClient real y devuelve lo que expone.
	 *
	 * `renderToStaticMarkup` ejecuta el cuerpo del componente una vez: alcanza
	 * para leer lo que el hook devuelve y para disparar sus mutaciones.
	 */
	function monta<T>(client: QueryClient, useHook: () => T): T {
		const holder: { value: T | null } = { value: null };
		function Probe() {
			holder.value = useHook();
			return null;
		}
		renderToStaticMarkup(
			createElement(QueryClientProvider, { client }, createElement(Probe)),
		);
		if (!holder.value) throw new Error("el hook no llegó a montarse");
		return holder.value;
	}

	test("la lista vive bajo [staff, list, businessId] y sólo consulta con negocio", () => {
		const client = new QueryClient();

		monta(client, () => hooks.useStaffMembers(BUSINESS_ID));

		const query = client
			.getQueryCache()
			.find({ queryKey: ["staff", "list", BUSINESS_ID] });
		expect(query).toBeDefined();
		// `enabled` es una opción del OBSERVADOR; el `Query` guarda las
		// opciones ya resueltas, así que se lee con un cast mínimo.
		const opciones = query?.options as { enabled?: boolean } | undefined;
		expect(opciones?.enabled).toBe(true);
	});

	test("sin negocio la consulta no se habilita", () => {
		const client = new QueryClient();

		monta(client, () => hooks.useStaffMembers(""));

		const query = client
			.getQueryCache()
			.find({ queryKey: ["staff", "list", ""] });
		const opciones = query?.options as { enabled?: boolean } | undefined;
		expect(opciones?.enabled).toBe(false);
	});

	test("las ocho mutaciones invalidan la lista del equipo", async () => {
		// Un cliente por caso: la invalidación es una marca en la caché, y sin
		// un cliente nuevo el segundo caso heredaría la del primero y no
		// probaría nada.
		const casos = [
			{
				operacion: "alta",
				prepara: () => apiPost.mockResolvedValue(TARJETA),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.create.mutateAsync({
						label: "Ana",
						business_location_ids: [LOCATION_ID],
					}),
			},
			{
				operacion: "edición",
				prepara: () => apiPatch.mockResolvedValue(MIEMBRO),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.update.mutateAsync({
						memberId: MEMBER_ID,
						body: { role: "manager" },
					}),
			},
			{
				operacion: "alias",
				prepara: () =>
					apiPatch.mockResolvedValue({
						member: MIEMBRO,
						alias_warnings: [],
					}),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.updateAlias.mutateAsync({
						memberId: MEMBER_ID,
						alias: "ana@panaderia.role.ec",
					}),
			},
			{
				operacion: "rotación",
				prepara: () => apiPost.mockResolvedValue(TARJETA),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.rotate.mutateAsync(MEMBER_ID),
			},
			{
				operacion: "pausa",
				prepara: () => apiPost.mockResolvedValue(MIEMBRO),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.disable.mutateAsync(MEMBER_ID),
			},
			{
				operacion: "reactivación",
				prepara: () => apiPost.mockResolvedValue(MIEMBRO),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.enable.mutateAsync(MEMBER_ID),
			},
			{
				operacion: "baja",
				prepara: () => apiDelete.mockResolvedValue(undefined),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.remove.mutateAsync(MEMBER_ID),
			},
			{
				operacion: "transferencia",
				prepara: () =>
					apiPost.mockResolvedValue({
						previous_owner: { ...MIEMBRO, role: "manager" },
						new_owner: { ...MIEMBRO, role: "owner" },
					}),
				dispara: (mutaciones: ReturnType<typeof hooks.useStaffMutations>) =>
					mutaciones.transferOwnership.mutateAsync(MEMBER_ID),
			},
		];

		for (const caso of casos) {
			const client = new QueryClient({
				defaultOptions: { mutations: { retry: false } },
			});
			client.setQueryData(["staff", "list", BUSINESS_ID], [MIEMBRO]);
			client.setQueryData(["businesses", "operated", USER_ID], []);
			const mutations = monta(client, () =>
				hooks.useStaffMutations(BUSINESS_ID),
			);

			caso.prepara();
			await caso.dispara(mutations);

			expect(
				client.getQueryState(["staff", "list", BUSINESS_ID])?.isInvalidated,
			).toBe(true);
			// Y sólo la lista del equipo: el resto del panel no se toca (la
			// transferencia es la excepción, y tiene su propio caso).
			if (caso.operacion !== "transferencia") {
				expect(
					client.getQueryState(["businesses", "operated", USER_ID])
						?.isInvalidated,
				).toBe(false);
			}
		}
	});

	test("la transferencia invalida también los negocios: cambió el rol del dueño", async () => {
		const client = new QueryClient({
			defaultOptions: { mutations: { retry: false } },
		});
		client.setQueryData(["staff", "list", BUSINESS_ID], [MIEMBRO]);
		client.setQueryData(["businesses", "operated", USER_ID], []);
		apiPost.mockResolvedValue({
			previous_owner: { ...MIEMBRO, role: "manager" },
			new_owner: { ...MIEMBRO, role: "owner" },
		});
		const mutations = monta(client, () => hooks.useStaffMutations(BUSINESS_ID));

		await mutations.transferOwnership.mutateAsync(MEMBER_ID);

		expect(
			client.getQueryState(["staff", "list", BUSINESS_ID])?.isInvalidated,
		).toBe(true);
		expect(
			client.getQueryState(["businesses", "operated", USER_ID])?.isInvalidated,
		).toBe(true);
	});
});
